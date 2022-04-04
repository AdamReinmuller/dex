import {
  Button,
  Flex,
  FormControl,
  FormLabel,
  Heading,
  Input,
  Modal,
  ModalBody,
  ModalCloseButton,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalOverlay,
  Spinner,
  Table,
  TableCaption,
  TableContainer,
  Tbody,
  Td,
  Text,
  Th,
  Thead,
  Tr,
  useDisclosure,
} from "@chakra-ui/react";
import {
  formatBytes32String,
  formatEther,
  parseBytes32String,
  parseEther,
} from "ethers/lib/utils";
import {
  Dispatch,
  MutableRefObject,
  SetStateAction,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { Container, Logo } from "../components";
import {
  ApprovalState,
  useApproval,
  useDeposit,
  useDexBalance,
  useIsNative,
  useNativeBalance,
  useTickerList,
  useTokenAddress,
  useTokenBalance,
} from "../lib/hooks";

type ActionButtonsProps = {
  ticker: string;
  setActiveTicker: Dispatch<SetStateAction<string | undefined>>;
  onOpen: () => void;
};

const ActionButtons = ({
  ticker,
  onOpen,
  setActiveTicker,
}: ActionButtonsProps) => {
  const handleDeposit = useCallback(
    (ticker: string) => {
      setActiveTicker(ticker);
      onOpen();
    },
    [onOpen, setActiveTicker]
  );

  return (
    <Flex gap={4}>
      <Button
        onClick={() => handleDeposit(ticker)}
        colorScheme="green"
        size="sm"
      >
        Deposit
      </Button>
      <Button colorScheme="red" size="sm">
        Withdraw
      </Button>
      <Button colorScheme="blue" size="sm">
        Trade
      </Button>
    </Flex>
  );
};

type TokenRowProps = ActionButtonsProps & {
  ticker: string;
};

const TokenRow = ({ ticker, onOpen, setActiveTicker }: TokenRowProps) => {
  const tickerString = parseBytes32String(ticker);
  const tokenAddress = useTokenAddress(ticker);
  const isNative = useIsNative(ticker);

  const { data: nativeBalance } = useNativeBalance();
  const { data: tokenBalance } = useTokenBalance(tokenAddress);
  const { data: dexBalance } = useDexBalance(ticker);

  const balance = isNative ? nativeBalance : tokenBalance;

  return (
    <Tr>
      <Td>
        <Flex align="center" gap={2}>
          <Logo ticker={tickerString} />
          <Text>{tickerString}</Text>
        </Flex>
      </Td>
      <Td isNumeric>
        {balance ? formatEther(balance) : <Spinner size="sm" />}
      </Td>
      <Td isNumeric>
        {dexBalance ? formatEther(dexBalance) : <Spinner size="sm" />}
      </Td>
      <Td>
        <ActionButtons
          onOpen={onOpen}
          setActiveTicker={setActiveTicker}
          ticker={ticker}
        />
      </Td>
    </Tr>
  );
};

type DepositButtonProps = {
  approvalState: ApprovalState;
  ticker: string;
  approve: () => void;
  deposit: () => void;
  depositStatus: "error" | "idle" | "loading" | "success";
};

const DepositButton = ({
  approvalState,
  approve,
  deposit,
  depositStatus,
  ticker,
}: DepositButtonProps) => {
  const tickerString = parseBytes32String(ticker);

  if (depositStatus === "loading") {
    return (
      <Button disabled colorScheme="purple" w="full">
        Depositing {tickerString}...
      </Button>
    );
  }

  switch (approvalState) {
    case ApprovalState.PENDING:
      return (
        <Button disabled colorScheme="purple" w="full">
          Approving {tickerString}...
        </Button>
      );
    case ApprovalState.NOT_APPROVED:
      return (
        <Button onClick={approve} colorScheme="purple" w="full">
          Approve {tickerString}
        </Button>
      );

    case ApprovalState.APPROVED:
      return (
        <Button onClick={deposit} colorScheme="purple" w="full">
          Deposit
        </Button>
      );

    default:
      return (
        <Button onClick={deposit} colorScheme="purple" w="full">
          Deposit
        </Button>
      );
  }
};

type ActionModalProps = {
  initialRef: MutableRefObject<null>;
  isOpen: boolean;
  onClose: () => void;
  ticker?: string;
  amount: string;
  setAmount: Dispatch<SetStateAction<string>>;
};

const DepositModal = ({
  initialRef,
  isOpen,
  onClose,
  ticker,
  amount,
  setAmount,
}: ActionModalProps) => {
  const tokenAddress = useTokenAddress(ticker);
  const { approvalState, approve } = useApproval(
    ticker,
    tokenAddress,
    parseEther(amount || "0")
  );
  const { deposit, status: depositStatus } = useDeposit(
    ticker,
    parseEther(amount || "0")
  );

  useEffect(() => {
    if (depositStatus === "success") {
      onClose();
    }
  }, [depositStatus, onClose]);

  if (!ticker) {
    return null;
  }

  return (
    <Modal
      size="xs"
      initialFocusRef={initialRef}
      isOpen={isOpen}
      onClose={onClose}
    >
      <ModalOverlay />
      <ModalContent backgroundColor="gray.800">
        <ModalHeader>Deposit {parseBytes32String(ticker)}</ModalHeader>
        <ModalCloseButton />
        <ModalBody pb={6}>
          <FormControl>
            <FormLabel>Amount</FormLabel>
            <Input
              borderWidth={0}
              borderBottomWidth={1}
              borderRadius="none"
              pl={0}
              ref={initialRef}
              disabled={
                approvalState === ApprovalState.PENDING ||
                depositStatus === "loading"
              }
              placeholder="0"
              onChange={(e) => setAmount(e.target.value)}
              value={amount}
              type="number"
              _focus={{
                outline: "none",
              }}
            />
          </FormControl>
        </ModalBody>

        <ModalFooter>
          <Flex direction="column">
            <DepositButton
              approvalState={approvalState}
              approve={approve}
              deposit={deposit}
              depositStatus={depositStatus}
              ticker={ticker}
            />
            <Text mt={4} fontSize="xs">
              * Save MATIC in Wallet for gas & Do not deposit more than in
              Wallet
            </Text>
          </Flex>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
};

const Wallet = () => {
  const initialRef = useRef(null);
  const [activeTicker, setActiveTicker] = useState<string>();
  const [amount, setAmount] = useState("");
  const { isOpen, onOpen, onClose: closeModal } = useDisclosure();
  const { data: tickerList, status } = useTickerList();

  const onClose = useCallback(() => {
    setActiveTicker(undefined);
    setAmount("");
    closeModal();
  }, [closeModal]);


  if (status === "loading" || !tickerList?.length) {
    return (
      <Container heading="Deposit & Withdraw">
        <Heading>Loading tokens...</Heading>
        <Spinner size="xl" />
      </Container>
    );
  }

  const tickerListWithNative = [formatBytes32String("MATIC"), ...tickerList];

  return (
    <Container heading="Deposit & Withdraw">
      <TableContainer>
        <Table variant="simple">
          <TableCaption>
            * Deposit from Wallet to Trade Account to be able to buy and sell
            tokens
          </TableCaption>
          <Thead>
            <Tr>
              <Th>Token</Th>
              <Th>Wallet</Th>
              <Th>Trade Account</Th>
              <Th isNumeric>Action</Th>
            </Tr>
          </Thead>
          <Tbody>
            {tickerListWithNative.map((ticker) => (
              <TokenRow
                key={ticker}
                ticker={ticker}
                onOpen={onOpen}
                setActiveTicker={setActiveTicker}
              />
            ))}
          </Tbody>
        </Table>
      </TableContainer>
      <DepositModal
        isOpen={isOpen}
        ticker={activeTicker}
        onClose={onClose}
        initialRef={initialRef}
        amount={amount}
        setAmount={setAmount}
      />
    </Container>
  );
};

export default Wallet;
