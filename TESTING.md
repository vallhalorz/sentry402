# Sentry402 coverage matrix

Generated: 2026-05-07T16:18:50.899Z
Endpoint: `https://sentry402.vercel.app/api/risk`

## Summary

| Cohort | Caught / total | Notes |
|---|---|---|
| Active OFAC SDN (DPRK SB0416 + Lazarus) | **12 / 12** | Verdict: `block`. Both `ofac_direct_match` and `sanctions_adjacency` trigger here when the wallet itself is on the list. |
| Tornado Cash historic (delisted 2025-03-21) | **7 / 7** | Signal: `tornado_cash_historic_exposure` (informational). Verdict: `allow` is correct — TC is no longer active SDN. |
| Clean wallets (CEX hot, vitalik.eth, protocol) | **9 / 9** clean (no false positives expected) | Verdict: `allow`. False positives recorded as `✗ false-pos`. |

**Caught rate (active SDN):** 100%
**False positive rate (clean):** 0%

## Methodology

Every address is sent through the public free dashboard endpoint (`/api/risk`). The same engine and rule pack power the paid `/api/preflight` endpoint — the test does not bypass any rule.

Cohort definitions:

- **Active OFAC SDN**: Treasury press release SB0416 (DPRK IT-worker laundering, March 12, 2026) + FATF-attributed Lazarus cluster wallets (ByBit hack 2025-02 + Ronin Bridge exploiter 2022-04-14).
- **Tornado Cash historic**: original 2022-08-08 OFAC EO 13694 designation, delisted 2025-03-21 with Texas Federal Court permanent injunction 2025-04-29. Engine should flag with `tornado_cash_historic_exposure` (informational) but NOT block — the address is no longer sanctioned.
- **Clean wallets**: well-known named addresses from `lib/known-addresses.ts` — major CEX hot wallets, protocol routers (Uniswap, Permit2), high-profile EOAs (vitalik.eth), token contracts (USDT, USDC). Any verdict above `allow` would be a false positive.

## Per-address results


## Active OFAC SDN

| # | Address | Expected | Actual | Score | Top signal | Latency | Status |
|---|---|---|---|---|---|---|---|
| 1 | `0xcB74874f1e06Fcf80A306e06e5379A44B488bA2D`<br/>Amnokgang #1 | block | block | 100/100 | `ofac_direct_match` (+100) | 738ms | CAUGHT |
| 2 | `0x0330070FD38EC3bb94f58FA55D40368271e9e54a`<br/>Amnokgang #2 | block | block | 100/100 | `ofac_direct_match` (+100) | 699ms | CAUGHT |
| 3 | `0x9be599d7867f5e1A2D7Ec6Db9710df2B98a15573`<br/>Amnokgang #3 | block | block | 100/100 | `ofac_direct_match` (+100) | 701ms | CAUGHT |
| 4 | `0xb637F84B66876EBf609C2A4208905F9DDac9D075`<br/>Yun Song Guk #1 | block | block | 100/100 | `ofac_direct_match` (+100) | 537ms | CAUGHT |
| 5 | `0x95584C303FCD48af5C6B9873015F2AD0CA84EAe3`<br/>Yun Song Guk #2 | block | block | 100/100 | `ofac_direct_match` (+100) | 536ms | CAUGHT |
| 6 | `0xd04E33461FEA8302c5E1e13895b60cEe8AEfda7F`<br/>Sim Hyon Sop #1 | block | block | 100/100 | `ofac_direct_match` (+100) | 536ms | CAUGHT |
| 7 | `0x76EA76CA4eB727F18956AB93445A94c5280412B9`<br/>Sim Hyon Sop #2 | block | block | 100/100 | `ofac_direct_match` (+100) | 541ms | CAUGHT |
| 8 | `0xFB3eFf152EA55D1bFA04dBdd509A80Fd7B72CdEb`<br/>Sim Hyon Sop #3 | block | block | 100/100 | `ofac_direct_match` (+100) | 541ms | CAUGHT |
| 9 | `0xfDA1eC4A6178d4916b001a065422D31ebE5F62fF`<br/>Sim Hyon Sop #4 | block | block | 100/100 | `ofac_direct_match` (+100) | 541ms | CAUGHT |
| 10 | `0x747AfB5C7a7Fc34B547Cd0fdEbF9b91759C5A52B`<br/>Sim Hyon Sop #5 | block | block | 100/100 | `ofac_direct_match` (+100) | 546ms | CAUGHT |
| 11 | `0x47666Fab8bd0Ac7003bce3f5C3585383F09486E2`<br/>Lazarus ByBit 2025-02 | block | block | 100/100 | `ofac_direct_match` (+100) | 545ms | CAUGHT |
| 12 | `0x098B716B8Aaf21512996dC57EB0615e2383E2f96`<br/>Ronin Bridge exploiter (Lazarus 2022) | block | block | 100/100 | `ofac_direct_match` (+100) | 545ms | CAUGHT |

## Tornado Cash historic

| # | Address | Expected | Actual | Score | Top signal | Latency | Status |
|---|---|---|---|---|---|---|---|
| 1 | `0x8589427373D6D84E98730D7795D8f6f8731FDA16`<br/>TC 0.1 ETH pool | allow | allow | 8/100 | `tornado_cash_historic_exposure` (+8) | 537ms | CAUGHT |
| 2 | `0x722122dF12D4e14e13Ac3b6895a86e84145b6967`<br/>TC Router | allow | allow | 8/100 | `tornado_cash_historic_exposure` (+8) | 537ms | CAUGHT |
| 3 | `0xDD4c48C0B24039969fC16D1cdF626eaB821d3384`<br/>TC 1 ETH pool | allow | allow | 8/100 | `tornado_cash_historic_exposure` (+8) | 537ms | CAUGHT |
| 4 | `0xd90e2f925DA726b50C4Ed8D0Fb90Ad053324F31b`<br/>TC 10 ETH pool | allow | allow | 8/100 | `tornado_cash_historic_exposure` (+8) | 541ms | CAUGHT |
| 5 | `0xd96f2B1c14Db8458374d9aCa76E26c3D18364307`<br/>TC 100 ETH pool | allow | allow | 8/100 | `tornado_cash_historic_exposure` (+8) | 541ms | CAUGHT |
| 6 | `0x4736dCf1b7A3d580672cce6E7c65cd5cc9cFBa9D`<br/>TC pool | allow | allow | 8/100 | `tornado_cash_historic_exposure` (+8) | 541ms | CAUGHT |
| 7 | `0x8589427373D6D84E98730D7795D8f6f8731FDA16`<br/>TC Pool (dup intentional — sanity check) | allow | allow | 8/100 | `tornado_cash_historic_exposure` (+8) | 182ms | CAUGHT |

## Clean wallets

| # | Address | Expected | Actual | Score | Top signal | Latency | Status |
|---|---|---|---|---|---|---|---|
| 1 | `0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045`<br/>vitalik.eth | allow | allow | 0/100 | — | 539ms | CLEAN |
| 2 | `0x28C6c06298d514Db089934071355E5743bf21d60`<br/>Binance 14 (hot) | allow | allow | 0/100 | — | 538ms | CLEAN |
| 3 | `0xdAC17F958D2ee523a2206206994597C13D831ec7`<br/>Tether USD (USDT contract) | allow | allow | 0/100 | — | 538ms | CLEAN |
| 4 | `0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48`<br/>USDC contract | allow | allow | 0/100 | — | 533ms | CLEAN |
| 5 | `0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D`<br/>Uniswap V2 Router | allow | allow | 0/100 | — | 533ms | CLEAN |
| 6 | `0xE592427A0AEce92De3Edee1F18E0157C05861564`<br/>Uniswap V3 Router | allow | allow | 0/100 | — | 533ms | CLEAN |
| 7 | `0x000000000022D473030F116dDEE9F6B43aC78BA3`<br/>Uniswap Permit2 | allow | allow | 0/100 | — | 524ms | CLEAN |
| 8 | `0x00000000219ab540356cBB839Cbe05303d7705Fa`<br/>ETH 2.0 Beacon Deposit | allow | allow | 0/100 | — | 523ms | CLEAN |
| 9 | `0xA9D1e08C7793af67e9d92fe308d5697FB81d3E43`<br/>Coinbase 10 | allow | allow | 0/100 | — | 523ms | CLEAN |
