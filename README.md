# Orderbook based dex project

Built from scratch to learn:

- Smart contract development
- Interaction with the contracts on the frontend

## Tech stack

- Hardhat
- NextJS
- EthersJS
- UseDapp
- React Query
- Chakra UI

## How to use

Execute [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app) with [npm](https://docs.npmjs.com/cli/init) or [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/) to bootstrap the example:

```bash
npx create-next-app --example with-chakra-ui-typescript with-chakra-ui-typescript-app
# or
yarn create next-app --example with-chakra-ui-typescript with-chakra-ui-typescript-app
```

Deploy it to the cloud with [Vercel](https://vercel.com/new?utm_source=github&utm_medium=readme&utm_campaign=next-example) ([Documentation](https://nextjs.org/docs/deployment)).

## Further improvements

1. Refactor
2. Separate balance which are active on a limit order
3. Limit orders activate buys/sells not just orderbook addition
4. Implement various decimals nut just standard 18
5. Abstract further away Contract calls and their states
6. Logging and Transaction tracking
7. True multichain support
8. Design overhaul
9. Work out useDapp quirks, I found it buggy but it's awesome besides its issues
