import { AddressZero } from "@ethersproject/constants";
import { JsonRpcSigner, Web3Provider } from "@ethersproject/providers";
import { ChainId, ERC20Interface, useEthers } from "@usedapp/core";
import { BigNumber, Contract } from "ethers";
import {
  formatBytes32String,
  Interface,
  isAddress,
  parseBytes32String,
} from "ethers/lib/utils";
import { useCallback, useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { useMutation, useQuery, useQueryClient } from "react-query";
import { Contracts, NATIVE_CURRENCY } from "../../config";
import DexJson from "../abis/Dex.json";
import { Dex, ERC20 } from "../types";

export enum ApprovalState {
  // bug
  // eslint-disable-next-line no-unused-vars
  UNKNOWN = "UNKNOWN",
  // eslint-disable-next-line no-unused-vars
  NOT_APPROVED = "NOT_APPROVED",
  // eslint-disable-next-line no-unused-vars
  APPROVED = "APPROVED",
  // eslint-disable-next-line no-unused-vars
  PENDING = "PENDING",
}

export enum Side {
  // eslint-disable-next-line no-unused-vars
  BUY = 0,
  // eslint-disable-next-line no-unused-vars
  SELL = 1,
}

const DexInterface = new Interface(DexJson.abi);

const getSigner = (library: Web3Provider, account: string): JsonRpcSigner => {
  return library.getSigner(account).connectUnchecked();
};

const getProviderOrSigner = (
  library: Web3Provider,
  account?: string
): Web3Provider | JsonRpcSigner => {
  return account ? getSigner(library, account) : library;
};

const getContract = (
  address: string,
  ABI: any,
  library: Web3Provider,
  account?: string
): Contract => {
  if (!isAddress(address) || address === AddressZero) {
    throw Error(`Invalid 'address' parameter '${address}'.`);
  }
  return new Contract(address, ABI, getProviderOrSigner(library, account));
};

const useContract = (
  address: string | undefined,
  ABI: any,
  withSignerIfPossible = true
): Contract | null => {
  const { library, account } = useEthers();
  return useMemo(() => {
    if (!address || address === AddressZero || !ABI || !library) {
      return null;
    }
    try {
      return getContract(
        address,
        ABI,
        library as Web3Provider,
        withSignerIfPossible && account ? account : undefined
      );
    } catch (error) {
      console.error("Failed to get contract", error);
      return null;
    }
  }, [address, ABI, library, withSignerIfPossible, account]);
};

export function useTokenContract(
  tokenAddress?: string,
  withSignerIfPossible?: boolean
): ERC20 | null {
  return useContract(
    tokenAddress,
    ERC20Interface,
    withSignerIfPossible
  ) as unknown as ERC20;
}

export function useChainId() {
  const { chainId } = useEthers();

  switch (chainId) {
    case ChainId.Mumbai:
      return chainId;
    default:
      return ChainId.Mumbai;
  }
}

const useDexContract = (withSignerIfPossible?: boolean): Dex | null => {
  const chainId = useChainId();

  const dex = useContract(
    Contracts[chainId].dex,
    DexInterface,
    withSignerIfPossible
  ) as unknown as Dex;
  return dex;
};

export const useTickerList = () => {
  const dex = useDexContract(false);
  const tickerListQuery = useQuery("tickers", () => dex!.getTokenList(), {
    enabled: !!dex,
  });

  return tickerListQuery;
};

export const useAddressList = () => {
  const dex = useDexContract(false);

  const addressListQuery = useQuery("addresses", () => dex!.getAddressList(), {
    enabled: !!dex,
  });
  return addressListQuery;
};

export const useTokenAddress = (ticker?: string) => {
  const dex = useDexContract(false);

  const tokenDetails = useQuery(
    ["address", ticker],
    () => dex!.tokenMapping(ticker!),
    {
      enabled: !!ticker && !!dex,
    }
  );

  return tokenDetails.data?.tokenAddress;
};

export const useIsNative = (ticker?: string) => {
  const chainId = useChainId();

  if (!ticker) {
    return null;
  }

  return parseBytes32String(ticker) === NATIVE_CURRENCY[chainId];
};

export const useAddToken = (ticker?: string, tokenAddress?: string) => {
  const dexContract = useDexContract();

  const mutation = useMutation(() =>
    dexContract!.addToken(ticker!, tokenAddress!).then((res) => {
      const mine = res.wait();
      toast.promise(
        mine,
        {
          loading: `adding ${ticker && parseBytes32String(ticker)}`,
          success: "Successfully added",
          error: (err) => `Error adding: ${ticker}: ${err.toString()}`,
        },
        {
          success: {
            duration: 5000,
          },
        }
      );
      return mine;
    })
  );

  return mutation;
};

export const useNativeBalance = () => {
  const { account, library } = useEthers();

  const balanceQuery = useQuery(
    ["balance", "native"],
    () => getSigner(library as Web3Provider, account!).getBalance(),
    {
      enabled: !!account && !!library,
    }
  );

  return balanceQuery;
};

export const useTokenBalance = (address?: string) => {
  const { account } = useEthers();

  const contract = useTokenContract(address, false);

  const balanceQuery = useQuery(
    ["balance", address],
    () => contract!.balanceOf(account!),
    {
      enabled: !!account && !!contract,
    }
  );

  return balanceQuery;
};

export const useDexBalance = (ticker?: string) => {
  const { account } = useEthers();
  const isNative = useIsNative(ticker);

  const tokenOrNativeTicker = isNative ? formatBytes32String("ETH") : ticker;
  const dex = useDexContract();

  const balanceQuery = useQuery(
    ["balance", "dex", tokenOrNativeTicker],
    () => dex!.balances(account!, tokenOrNativeTicker!),
    {
      enabled: !!account && !!tokenOrNativeTicker && !!dex,
    }
  );

  return balanceQuery;
};

export const useAllowance = (address?: string) => {
  const { account } = useEthers();
  const chainId = useChainId();

  const contract = useTokenContract(address, false);
  const allowance = useQuery(
    ["allowance", address],
    () => contract!.allowance(account!, Contracts[chainId].dex),
    {
      enabled: !!contract && !!account && !!address,
      refetchInterval: 60 * 1000,
    }
  );

  return allowance;
};

// NOTE: calling only getOrderbook with useQuery would result in missing data for some strange reason
const fetchOrderbook = async (dexContract: Dex, ticker: string, side: Side) => {
  const res = await dexContract.getOrderBook(ticker, side);

  return res.map((order) => ({ ...order }));
};

export const useOrderbook = (ticker?: string, side?: Side) => {
  const dexContract = useDexContract(false);

  const { status, data } = useQuery(
    ["orderbook", ticker, side],
    () => fetchOrderbook(dexContract!, ticker!, side!),
    {
      enabled: !!dexContract && !!ticker && (side === undefined ? false : true),
      refetchInterval: 60 * 1000,
    }
  );

  return {
    status,
    data,
  };
};

export const useApproval = (
  ticker?: string,
  tokenAddress?: string,
  amountToApprove?: BigNumber
) => {
  const [approvalState, setApprovalState] = useState(ApprovalState.UNKNOWN);

  const chainId = useChainId();
  const isNative = useIsNative(ticker);
  const queryClient = useQueryClient();
  const tokenContract = useTokenContract(tokenAddress);
  const { data: currentAllowance } = useAllowance(tokenAddress);

  const approveMutation = useMutation(
    () =>
      tokenContract!
        .approve(Contracts[chainId].dex, amountToApprove!)
        .then((res) => {
          setApprovalState(ApprovalState.PENDING);
          const mined = res.wait();
          toast.promise(
            mined,
            {
              loading: `Approving ${
                ticker && parseBytes32String(ticker)
              } spending limit`,
              success: "Successfully approwal of spending limit",
              error: (err) =>
                `Error approving ${
                  ticker && parseBytes32String(ticker)
                } spending limit: ${err.toString()}`,
            },
            {
              success: {
                duration: 5000,
              },
            }
          );
          return mined;
        }),
    {
      onSettled: () => {
        setApprovalState(ApprovalState.UNKNOWN);
        queryClient.invalidateQueries("allowance");
      },
    }
  );

  const approve = () => {
    if (approvalState !== ApprovalState.NOT_APPROVED) {
      console.error("approve was called unnecessarily");
      return;
    }

    if (!tokenContract) {
      console.error("tokenContract is null");
      return;
    }

    if (amountToApprove?.eq(0)) {
      console.error("missing amount to approve");
      return;
    }

    return approveMutation.mutate();
  };

  useEffect(() => {
    if (approvalState === ApprovalState.PENDING) {
      return;
    }

    if (!amountToApprove) {
      setApprovalState(ApprovalState.UNKNOWN);
      return;
    }

    if (isNative) {
      setApprovalState(ApprovalState.APPROVED);
      return;
    }
    // we might not have enough data to know whether or not we need to approve
    if (!currentAllowance) {
      setApprovalState(ApprovalState.UNKNOWN);
      return;
    }

    // amountToApprove will be defined if currentAllowance is
    if (currentAllowance.lt(amountToApprove)) {
      setApprovalState(ApprovalState.NOT_APPROVED);
      return;
    }
    setApprovalState(ApprovalState.APPROVED);
  }, [amountToApprove, approvalState, currentAllowance, isNative]);

  return { approvalState, approve };
};

export const useDeposit = (ticker?: string, amountToDeposit?: BigNumber) => {
  const isNative = useIsNative(ticker);
  const queryClient = useQueryClient();
  const dexContract = useDexContract();

  const nativeDepositMutation = useMutation(
    () =>
      dexContract!
        .depositEth({ value: amountToDeposit })
        .then((res) => {
          const mined = res.wait();
          toast.promise(
            mined,
            {
              loading: `Depositing MATIC...`,
              success: "Successful deposit",
              error: (err) =>
                `Error depositing MATIC
            }: ${err.toString()}`,
            },
            {
              success: {
                duration: 5000,
              },
            }
          );
          return mined;
        })
        .catch((err) => {
          toast.error(`Error depositing: ${err.data.message}`);
        }),
    {
      onSettled: () => {
        queryClient.invalidateQueries("balance");
      },
    }
  );

  const tokenDepositMutation = useMutation(
    () =>
      dexContract!
        .deposit(amountToDeposit!, ticker!)
        .then((res) => {
          const mined = res.wait();
          toast.promise(
            mined,
            {
              loading: `Depositing ${ticker && parseBytes32String(ticker)}...`,
              success: "Successful deposit",
              error: (err) =>
                `Error depositing ${
                  ticker && parseBytes32String(ticker)
                }: ${err.toString()}`,
            },
            {
              success: {
                duration: 5000,
              },
            }
          );
          return mined;
        })
        .catch((err) => {
          toast.error(`Error depositing: ${err.data.message}`);
        }),
    {
      onSettled: () => {
        queryClient.invalidateQueries("balance");
      },
    }
  );

  const deposit = useCallback(() => {
    if (!dexContract) {
      console.error("dex contract is null");
      return;
    }

    if (!ticker) {
      console.error("token contract is null");
      return;
    }

    if (amountToDeposit?.eq(0)) {
      console.error("missing amount to deposit");
      return;
    }

    return isNative
      ? nativeDepositMutation.mutate()
      : tokenDepositMutation.mutate();
  }, [
    amountToDeposit,
    dexContract,
    isNative,
    nativeDepositMutation,
    ticker,
    tokenDepositMutation,
  ]);

  return {
    status: isNative
      ? nativeDepositMutation.status
      : tokenDepositMutation.status,
    deposit,
  };
};

export const useWithdraw = (ticker?: string, amountToWithdraw?: BigNumber) => {
  const isNative = useIsNative(ticker);
  const queryClient = useQueryClient();
  const dexContract = useDexContract();

  const nativeWithdrawMutation = useMutation(
    () =>
      dexContract!
        .withdrawEth(amountToWithdraw!)
        .then((res) => {
          const mined = res.wait();
          toast.promise(mined, {
            loading: `Withdrawing MATIC...`,
            success: "Successful withdrawal",
            error: (err) =>
              `Error withdrawing MATIC
            }: ${err.toString()}`,
          });
          return mined;
        })
        .catch((err) => {
          toast.error(`Error withdrawing: ${err.data.message}`);
        }),
    {
      onSettled: () => {
        queryClient.invalidateQueries("balance");
      },
    }
  );

  const tokenWithdrawMutation = useMutation(
    () =>
      dexContract!
        .withdraw(amountToWithdraw!, ticker!)
        .then((res) => {
          const mined = res.wait();
          toast.promise(
            mined,
            {
              loading: `Withdrawing ${ticker && parseBytes32String(ticker)}...`,
              success: "Successful withdrawal",
              error: (err) =>
                `Error withdrawing ${
                  ticker && parseBytes32String(ticker)
                }: ${err.toString()}`,
            },
            {
              success: {
                duration: 5000,
              },
            }
          );
          return mined;
        })
        .catch((err) => {
          toast.error(`Error withdrawing: ${err.data.message}`);
        }),
    {
      onSuccess: () => {
        queryClient.invalidateQueries("balance");
      },
    }
  );

  const withdraw = useCallback(() => {
    if (!dexContract) {
      console.error("dex contract is null");
      return;
    }

    if (!ticker) {
      console.error("token contract is null");
      return;
    }

    if (amountToWithdraw?.eq(0)) {
      console.error("missing amount to withdraw");
      return;
    }

    return isNative
      ? nativeWithdrawMutation.mutate()
      : tokenWithdrawMutation.mutate();
  }, [
    amountToWithdraw,
    dexContract,
    isNative,
    nativeWithdrawMutation,
    ticker,
    tokenWithdrawMutation,
  ]);

  return {
    status: isNative
      ? nativeWithdrawMutation.status
      : tokenWithdrawMutation.status,
    withdraw,
  };
};

export const useLimitOrder = (
  ticker?: string,
  amount?: BigNumber,
  price?: BigNumber,
  side?: Side
) => {
  const queryClient = useQueryClient();
  const dexContract = useDexContract();

  const limitOrderMutation = useMutation(
    () =>
      dexContract!
        .createLimitOrder(side!, ticker!, amount!, price!)
        .then((res) => {
          const mined = res.wait();
          toast.promise(
            mined,
            {
              loading: `Creating limit order...`,
              success: "Limit order created",
              error: (err) => `Error creating limit order: ${err.toString()}`,
            },
            {
              success: {
                duration: 5000,
              },
            }
          );
          return mined;
        })
        .catch((err) => {
          toast.error(`Error creating limit order: ${err.data.message}`);
        }),
    {
      onSuccess: () => {
        queryClient.invalidateQueries(["balance"]);
        queryClient.invalidateQueries(["orderbook"]);
      },
    }
  );

  const createLimitOrder = useCallback(() => {
    if (!dexContract) {
      console.error("dex contract is null");
      return;
    }

    if (!ticker) {
      console.error("token contract is null");
      return;
    }

    if (amount?.eq(0)) {
      console.error("missing amount");
      return;
    }

    if (price?.eq(0)) {
      console.error("missing price");
      return;
    }

    limitOrderMutation.mutate();
  }, [amount, dexContract, limitOrderMutation, price, ticker]);

  return { createLimitOrder, status: limitOrderMutation.status };
};

export const useMarketOrder = (
  ticker?: string,
  amount?: BigNumber,
  side?: Side
) => {
  const queryClient = useQueryClient();
  const dexContract = useDexContract();

  const limitOrderMutation = useMutation(
    () =>
      dexContract!
        .createMarketOrder(side!, ticker!, amount!)
        .then((res) => {
          const mined = res.wait();
          toast.promise(
            mined,
            {
              loading: `Executing market order...`,
              success: "Successful market order",
              error: (err) => `Error creating market order: ${err.toString()}`,
            },
            {
              success: {
                duration: 5000,
              },
            }
          );
          return mined;
        })
        .catch((err) => {
          toast.error(`Error creating market order: ${err.data.message}`);
        }),
    {
      onSuccess: () => {
        queryClient.invalidateQueries(["balance"]);
        queryClient.invalidateQueries(["orderbook"]);
      },
    }
  );

  const createMarketOrder = useCallback(() => {
    if (!dexContract) {
      console.error("dex contract is null");
      return;
    }

    if (!ticker) {
      console.error("token contract is null");
      return;
    }

    if (amount?.eq(0)) {
      console.error("missing amount");
      return;
    }

    limitOrderMutation.mutate();
  }, [amount, dexContract, limitOrderMutation, ticker]);

  return { createMarketOrder, status: limitOrderMutation.status };
};
