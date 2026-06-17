import React, { useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box, Flex, Heading, Text, VStack, HStack, Grid, Badge, Table,
} from '@chakra-ui/react';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@chakra-ui/react';
import 'katex/dist/katex.min.css';

const cardBg = 'var(--card-bg, #1a1a2e)';
const headingColor = 'var(--heading-color, #e0e0e0)';

function Card({ children, ...props }: { children: React.ReactNode } & Record<string, any>) {
  return (
    <Box bg={cardBg} borderRadius="lg" p={4} border="1px solid" borderColor="whiteAlpha.100" {...props}>
      {children}
    </Box>
  );
}

function Tex({ math, display = false }: { math: string; display?: boolean }) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    let mounted = true;
    (async () => {
      const katex = (await import('katex')).default;
      if (mounted && ref.current) {
        katex.render(math, ref.current, { displayMode: display, throwOnError: false, strict: false });
      }
    })();
    return () => { mounted = false; };
  }, [math, display]);
  return <span ref={ref} />;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card>
      <Heading size="sm" color={headingColor} mb={3}>{title}</Heading>
      {children}
    </Card>
  );
}

function Concept({ title, children, color = 'blue' }: { title: string; children: React.ReactNode; color?: string }) {
  return (
    <Box bg="whiteAlpha.50" borderRadius="md" p={3} borderLeft="3px solid" borderColor={`${color}.400`}>
      <Text fontSize="sm" fontWeight="bold" color={`${color}.300`} mb={1}>{title}</Text>
      {children}
    </Box>
  );
}

// ---------------------------------------------------------------------------
// Exchange Architecture & Trade Lifecycle
// ---------------------------------------------------------------------------
function ExchangeArchitectureSection() {
  return (
    <Section title="1. Exchange Architecture — How Trading Is Organized">
      <Text fontSize="sm" color="gray.300" mb={3}>
        Before diving into order books and hedging, it helps to understand the physical and organizational
        structure of the exchanges where securities trade, and what happens step-by-step when you click "Buy."
      </Text>

      {/* Exchange landscape */}
      <Text fontSize="sm" fontWeight="bold" color={headingColor} mb={2}>The Exchange Landscape</Text>
      <Grid templateColumns={{ base: '1fr', md: '1fr 1fr' }} gap={4} mb={4}>
        <Concept title="Stock Exchanges" color="blue">
          <Text fontSize="xs" color="gray.400">
            <strong>NYSE</strong> — Hybrid auction + electronic. Has Designated Market Makers (DMMs) on the floor
            who maintain fair and orderly markets in assigned stocks. Handles opening/closing auctions.<br />
            <strong>NASDAQ</strong> — Fully electronic, dealer-based. Multiple competing market makers per stock.
            Tends to list tech companies.<br />
            <strong>IEX, BATS/Cboe, ARCA, MEMX</strong> — Alternative exchanges competing on speed, fees, and order types.
            A stock like AAPL trades on 16+ venues simultaneously.
          </Text>
        </Concept>

        <Concept title="Options Exchanges" color="purple">
          <Text fontSize="xs" color="gray.400">
            <strong>CBOE</strong> — Largest options exchange. Home of VIX, SPX options, 0DTE.<br />
            <strong>ISE, MIAX, PHLX, BOX, PEARL</strong> — Competing options exchanges, each with different
            fee structures, priority rules, and order types.<br />
            <strong>OCC</strong> (Options Clearing Corporation) — Central counterparty for all US options.
            Guarantees every trade, manages margin, and handles exercise/assignment.
            When you buy an option, your counterparty is the OCC, not the person who sold it.
          </Text>
        </Concept>
      </Grid>

      {/* Trade lifecycle */}
      <Text fontSize="sm" fontWeight="bold" color={headingColor} mb={2}>Lifecycle of a Trade</Text>
      <Box overflowX="auto" mb={4}>
        <Table.Root size="sm" variant="outline">
          <Table.Header>
            <Table.Row>
              <Table.ColumnHeader fontSize="xs" w="40px">Step</Table.ColumnHeader>
              <Table.ColumnHeader fontSize="xs">Stage</Table.ColumnHeader>
              <Table.ColumnHeader fontSize="xs">What Happens</Table.ColumnHeader>
              <Table.ColumnHeader fontSize="xs">Who</Table.ColumnHeader>
              <Table.ColumnHeader fontSize="xs">Time</Table.ColumnHeader>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            <Table.Row>
              <Table.Cell fontSize="xs">1</Table.Cell>
              <Table.Cell fontSize="xs" fontWeight="bold">Order Entry</Table.Cell>
              <Table.Cell fontSize="xs">You click "Buy 100 AAPL." Your broker validates the order (margin, risk checks).</Table.Cell>
              <Table.Cell fontSize="xs">Broker (Schwab, IBKR, etc.)</Table.Cell>
              <Table.Cell fontSize="xs">~1ms</Table.Cell>
            </Table.Row>
            <Table.Row>
              <Table.Cell fontSize="xs">2</Table.Cell>
              <Table.Cell fontSize="xs" fontWeight="bold">Routing</Table.Cell>
              <Table.Cell fontSize="xs">
                Broker decides where to send the order: exchange (NYSE, NASDAQ), dark pool, or wholesaler (Citadel, Virtu).
                Retail orders usually go to wholesalers via PFOF. Institutional orders use Smart Order Routing (SOR) to find best price across venues.
              </Table.Cell>
              <Table.Cell fontSize="xs">Broker's router / SOR</Table.Cell>
              <Table.Cell fontSize="xs">~1-10ms</Table.Cell>
            </Table.Row>
            <Table.Row>
              <Table.Cell fontSize="xs">3</Table.Cell>
              <Table.Cell fontSize="xs" fontWeight="bold">Matching</Table.Cell>
              <Table.Cell fontSize="xs">
                The venue's matching engine pairs your buy with a resting sell order (price-time priority).
                If no match, your limit order rests in the book. Market orders match immediately at best available.
              </Table.Cell>
              <Table.Cell fontSize="xs">Exchange matching engine</Table.Cell>
              <Table.Cell fontSize="xs">~microseconds</Table.Cell>
            </Table.Row>
            <Table.Row>
              <Table.Cell fontSize="xs">4</Table.Cell>
              <Table.Cell fontSize="xs" fontWeight="bold">Execution Report</Table.Cell>
              <Table.Cell fontSize="xs">
                Exchange confirms the fill — price, quantity, timestamp. Published to the consolidated tape (SIP)
                so all participants see the trade.
              </Table.Cell>
              <Table.Cell fontSize="xs">Exchange → SIP → everyone</Table.Cell>
              <Table.Cell fontSize="xs">~1ms</Table.Cell>
            </Table.Row>
            <Table.Row>
              <Table.Cell fontSize="xs">5</Table.Cell>
              <Table.Cell fontSize="xs" fontWeight="bold">Clearing</Table.Cell>
              <Table.Cell fontSize="xs">
                The trade goes to a clearinghouse (DTCC for stocks, OCC for options). The clearinghouse becomes
                the counterparty to both sides, eliminating credit risk. Margin requirements are calculated.
              </Table.Cell>
              <Table.Cell fontSize="xs">DTCC / OCC / NSCC</Table.Cell>
              <Table.Cell fontSize="xs">Same day</Table.Cell>
            </Table.Row>
            <Table.Row>
              <Table.Cell fontSize="xs">6</Table.Cell>
              <Table.Cell fontSize="xs" fontWeight="bold">Settlement</Table.Cell>
              <Table.Cell fontSize="xs">
                Actual delivery of shares and cash. US stocks settle T+1 (since May 2024, previously T+2).
                Options settle T+1. The buyer receives shares in their account; the seller receives cash.
              </Table.Cell>
              <Table.Cell fontSize="xs">DTCC / custodian banks</Table.Cell>
              <Table.Cell fontSize="xs">T+1</Table.Cell>
            </Table.Row>
          </Table.Body>
        </Table.Root>
      </Box>

      {/* Key participants */}
      <Text fontSize="sm" fontWeight="bold" color={headingColor} mb={2}>Key Participants</Text>
      <Grid templateColumns={{ base: '1fr', md: '1fr 1fr 1fr' }} gap={4} mb={4}>
        <Concept title="Retail Traders" color="green">
          <Text fontSize="xs" color="gray.400">
            Individual investors. Orders typically routed to wholesalers. Considered "uninformed flow" —
            MMs offer better prices because retail is less likely to be trading on private information.
            Retail collectively moves markets via options flow (meme stocks).
          </Text>
        </Concept>

        <Concept title="Institutional Investors" color="blue">
          <Text fontSize="xs" color="gray.400">
            Pension funds, mutual funds, hedge funds. Large orders split via algos (TWAP, VWAP, POV).
            Considered potentially "informed" — MMs widen spreads when they detect institutional flow.
            Use dark pools to minimize information leakage.
          </Text>
        </Concept>

        <Concept title="Market Makers / HFT" color="orange">
          <Text fontSize="xs" color="gray.400">
            Provide liquidity by quoting bids and asks. Profit from spread × volume.
            Use co-location (servers next to the exchange) for speed.
            Obligated (on some exchanges) to maintain quotes during market hours.
            Handle inventory risk via hedging. Top firms: Citadel Securities, Virtu, Jane Street, Optiver.
          </Text>
        </Concept>
      </Grid>

      {/* Regulation */}
      <Text fontSize="sm" fontWeight="bold" color={headingColor} mb={2}>Regulation & Protections</Text>
      <Grid templateColumns={{ base: '1fr', md: '1fr 1fr' }} gap={4} mb={4}>
        <Concept title="Reg NMS (National Market System)" color="teal">
          <Text fontSize="xs" color="gray.400">
            <strong>Order Protection Rule:</strong> Exchanges cannot execute at prices worse than the best bid/ask
            displayed on any exchange (NBBO). If NYSE has a better ask, NASDAQ must route there.<br />
            <strong>Access Rule:</strong> Caps exchange fees at $0.30/100 shares, preventing unreasonable tolls.<br />
            <strong>Sub-Penny Rule:</strong> No quoting in sub-penny increments for stocks above $1 (prevents "stepping ahead" by fractions of a cent).
          </Text>
        </Concept>

        <Concept title="Circuit Breakers" color="red">
          <Text fontSize="xs" color="gray.400">
            <strong>LULD (Limit Up-Limit Down):</strong> Individual stocks halt for 5-15 min if price moves beyond
            a % band from reference price (5% for S&P 500, 10% for others).<br />
            <strong>Market-Wide Breakers:</strong> S&P 500 drops 7% → 15-min halt (Level 1). 13% → another halt (Level 2). 20% → market closes (Level 3).<br />
            <strong>Designed after:</strong> 1987 crash, 2010 Flash Crash.
          </Text>
        </Concept>
      </Grid>

      {/* Trading sessions */}
      <Text fontSize="sm" fontWeight="bold" color={headingColor} mb={2}>Trading Sessions (US)</Text>
      <Box overflowX="auto" mb={4}>
        <Table.Root size="sm" variant="outline">
          <Table.Header>
            <Table.Row>
              <Table.ColumnHeader fontSize="xs">Session</Table.ColumnHeader>
              <Table.ColumnHeader fontSize="xs">Time (ET)</Table.ColumnHeader>
              <Table.ColumnHeader fontSize="xs">Characteristics</Table.ColumnHeader>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            <Table.Row>
              <Table.Cell fontSize="xs">Pre-Market</Table.Cell>
              <Table.Cell fontSize="xs">4:00 AM – 9:30 AM</Table.Cell>
              <Table.Cell fontSize="xs">Low liquidity, wide spreads. Earnings reactions. ECN-only (no exchange specialists).</Table.Cell>
            </Table.Row>
            <Table.Row>
              <Table.Cell fontSize="xs">Opening Auction</Table.Cell>
              <Table.Cell fontSize="xs">9:28 – 9:30 AM</Table.Cell>
              <Table.Cell fontSize="xs">Accumulates orders, finds opening price to maximize matched volume. Critical for setting the day's reference.</Table.Cell>
            </Table.Row>
            <Table.Row>
              <Table.Cell fontSize="xs">Regular Hours</Table.Cell>
              <Table.Cell fontSize="xs">9:30 AM – 4:00 PM</Table.Cell>
              <Table.Cell fontSize="xs">Full liquidity. All order types. Options trading hours. Highest volume at open and close ("U-shaped" pattern).</Table.Cell>
            </Table.Row>
            <Table.Row>
              <Table.Cell fontSize="xs">Closing Auction</Table.Cell>
              <Table.Cell fontSize="xs">3:50 – 4:00 PM</Table.Cell>
              <Table.Cell fontSize="xs">~10% of daily volume. Sets closing price used by index funds, mutual funds, margin calculations.</Table.Cell>
            </Table.Row>
            <Table.Row>
              <Table.Cell fontSize="xs">After-Hours</Table.Cell>
              <Table.Cell fontSize="xs">4:00 PM – 8:00 PM</Table.Cell>
              <Table.Cell fontSize="xs">Thin liquidity. Earnings reactions. Limit orders only on most brokers.</Table.Cell>
            </Table.Row>
          </Table.Body>
        </Table.Root>
      </Box>

      {/* Options specifics */}
      <Text fontSize="sm" fontWeight="bold" color={headingColor} mb={2}>Options-Specific Structure</Text>
      <Grid templateColumns={{ base: '1fr', md: '1fr 1fr' }} gap={4}>
        <Concept title="Options Order Routing" color="purple">
          <Text fontSize="xs" color="gray.400">
            Options route across 16 exchanges. Unlike stocks, options have <strong>maker-taker</strong> and
            <strong> payment-for-order-flow</strong> models at the exchange level. Some exchanges pay brokers
            to send orders (PFOF exchanges like MIAX, BOX), others charge (pro-rata exchanges like CBOE).
            <br /><br />
            <strong>Priority rules</strong> vary: some exchanges use price-time (first order at a price gets filled first),
            others use pro-rata (all orders at a price get proportional fills). This affects how MMs compete.
          </Text>
        </Concept>

        <Concept title="Exercise & Assignment" color="red">
          <Text fontSize="xs" color="gray.400">
            <strong>American options</strong> (stocks): Can be exercised any time before expiry.
            Early exercise is rare but happens for deep ITM calls before ex-dividend dates.<br />
            <strong>European options</strong> (SPX, indices): Exercise only at expiry. Cash-settled — no share delivery.<br />
            <strong>Assignment:</strong> When a short option is exercised against you, the OCC randomly selects from
            the pool of short holders. You wake up with shares or a cash debit. ITM options at expiry are
            auto-exercised if ≥$0.01 ITM (OCC rule).
          </Text>
        </Concept>
      </Grid>
    </Section>
  );
}

// ---------------------------------------------------------------------------
// Order Book & Price Formation
// ---------------------------------------------------------------------------
function OrderBookSection() {
  return (
    <Section title="2. The Order Book — How Prices Form">
      <Text fontSize="sm" color="gray.300" mb={3}>
        Every stock and option has an <strong>order book</strong> — a queue of resting buy (bid) and sell (ask) orders at various prices.
        The price you see on a chart is not a fixed number; it's the result of continuous matching between buyers and sellers.
      </Text>

      <Grid templateColumns={{ base: '1fr', md: '1fr 1fr' }} gap={4} mb={4}>
        <Concept title="Bid & Ask" color="green">
          <Text fontSize="xs" color="gray.400">
            <strong>Bid</strong> = highest price someone is willing to pay (buyers queue here).
            <br /><strong>Ask</strong> = lowest price someone is willing to sell (sellers queue here).
            <br /><strong>Spread</strong> = Ask − Bid. Tighter spread = more liquid market.
          </Text>
          <Box mt={2}>
            <Tex math="\text{Mid Price} = \frac{\text{Bid} + \text{Ask}}{2}" display />
          </Box>
        </Concept>

        <Concept title="Market vs. Limit Orders" color="purple">
          <Text fontSize="xs" color="gray.400">
            <strong>Market order</strong>: execute immediately at the best available price. You "cross the spread" — you pay the ask when buying, receive the bid when selling.
            <br /><strong>Limit order</strong>: sit in the book until someone matches. You <em>provide</em> liquidity and may earn the spread.
          </Text>
        </Concept>
      </Grid>

      <Concept title="Price Impact" color="orange">
        <Text fontSize="xs" color="gray.400" mb={2}>
          Large orders consume liquidity at the best price, then eat into deeper levels of the book. The thinner the book, the more price moves per unit of volume.
        </Text>
        <Tex math="\Delta P \approx \lambda \cdot \sqrt{V}" display />
        <Text fontSize="2xs" color="gray.500" mt={1}>
          Square-root market impact model: price displacement ΔP scales with the square root of volume V, where λ captures market depth. This is why large institutional orders are sliced into smaller pieces (TWAP, VWAP algorithms).
        </Text>
      </Concept>

      <Box mt={4}>
        <Text fontSize="sm" fontWeight="bold" color={headingColor} mb={2}>Key Takeaway</Text>
        <Text fontSize="xs" color="gray.400">
          Price is not a static number — it's the equilibrium where buy and sell pressure meet. Every trade moves the equilibrium.
          Market makers profit by providing liquidity on both sides and capturing the bid-ask spread, while managing inventory risk.
        </Text>
      </Box>
    </Section>
  );
}

// ---------------------------------------------------------------------------
// Market Makers & Liquidity
// ---------------------------------------------------------------------------
function MarketMakersSection() {
  return (
    <Section title="3. Market Makers — The Invisible Plumbing">
      <Text fontSize="sm" color="gray.300" mb={3}>
        Market makers (MMs) continuously post bids and asks to provide liquidity. They don't bet on direction — they earn the spread.
        But their hedging activity has massive second-order effects on prices.
      </Text>

      <Grid templateColumns={{ base: '1fr', md: '1fr 1fr' }} gap={4} mb={4}>
        <Concept title="How MMs Work" color="teal">
          <Text fontSize="xs" color="gray.400">
            1. Post bid at $99.95, ask at $100.05 → earn $0.10 per round trip<br />
            2. When a customer buys a call, the MM sells it and immediately hedges:<br />
            &nbsp;&nbsp;• Buy Δ×100 shares to delta-hedge<br />
            &nbsp;&nbsp;• Continuously adjust as delta changes (gamma)<br />
            3. Profit = spread collected − hedging costs
          </Text>
        </Concept>

        <Concept title="Inventory Risk" color="red">
          <Text fontSize="xs" color="gray.400">
            MMs accumulate inventory when order flow is one-sided (e.g., everyone buying calls).
            They must hedge this inventory, creating <strong>directional pressure on the underlying stock</strong>.
            This is the core mechanism by which options flow moves stock prices.
          </Text>
        </Concept>
      </Grid>

      <Box bg="whiteAlpha.50" borderRadius="md" p={3}>
        <Text fontSize="sm" fontWeight="bold" color="yellow.300" mb={2}>The MM Profit Equation</Text>
        <Tex math="\text{MM P\&L} = \underbrace{\text{Spread Income}}_{\text{bid-ask}} - \underbrace{\frac{1}{2}\Gamma S^2 \sigma^2_{\text{realized}}}_{\text{hedging cost}} + \underbrace{\Theta}_{\text{time decay}}" display />
        <Text fontSize="2xs" color="gray.500" mt={1}>
          MMs profit when: (1) the spread they collect exceeds hedging costs, and (2) implied volatility
          they sold at exceeds realized volatility. This is exactly the P&L attribution you saw on the Options page.
        </Text>
      </Box>
    </Section>
  );
}

// ---------------------------------------------------------------------------
// Delta Hedging & Stock Price Impact
// ---------------------------------------------------------------------------
function DeltaHedgingImpactSection() {
  return (
    <Section title="4. Delta Hedging — How Options Move Stocks">
      <Text fontSize="sm" color="gray.300" mb={3}>
        When someone buys a call from a market maker, the MM must buy shares to delta-hedge.
        This creates buying pressure on the stock. The reverse happens with puts.
        The key insight: <strong>options order flow drives stock flow</strong>.
      </Text>

      <Table.Root size="sm" variant="outline" mb={4}>
        <Table.Header>
          <Table.Row>
            <Table.ColumnHeader fontSize="xs">Customer Action</Table.ColumnHeader>
            <Table.ColumnHeader fontSize="xs">MM Position</Table.ColumnHeader>
            <Table.ColumnHeader fontSize="xs">MM Hedge</Table.ColumnHeader>
            <Table.ColumnHeader fontSize="xs">Stock Impact</Table.ColumnHeader>
          </Table.Row>
        </Table.Header>
        <Table.Body>
          <Table.Row>
            <Table.Cell fontSize="xs">Buy calls</Table.Cell>
            <Table.Cell fontSize="xs">Short calls (−Δ)</Table.Cell>
            <Table.Cell fontSize="xs">Buy shares (+Δ)</Table.Cell>
            <Table.Cell fontSize="xs"><Badge colorPalette="green" fontSize="2xs">Bullish</Badge></Table.Cell>
          </Table.Row>
          <Table.Row>
            <Table.Cell fontSize="xs">Buy puts</Table.Cell>
            <Table.Cell fontSize="xs">Short puts (+Δ)</Table.Cell>
            <Table.Cell fontSize="xs">Sell/short shares (−Δ)</Table.Cell>
            <Table.Cell fontSize="xs"><Badge colorPalette="red" fontSize="2xs">Bearish</Badge></Table.Cell>
          </Table.Row>
          <Table.Row>
            <Table.Cell fontSize="xs">Sell calls</Table.Cell>
            <Table.Cell fontSize="xs">Long calls (+Δ)</Table.Cell>
            <Table.Cell fontSize="xs">Sell shares (−Δ)</Table.Cell>
            <Table.Cell fontSize="xs"><Badge colorPalette="red" fontSize="2xs">Bearish</Badge></Table.Cell>
          </Table.Row>
          <Table.Row>
            <Table.Cell fontSize="xs">Sell puts</Table.Cell>
            <Table.Cell fontSize="xs">Long puts (−Δ)</Table.Cell>
            <Table.Cell fontSize="xs">Buy shares (+Δ)</Table.Cell>
            <Table.Cell fontSize="xs"><Badge colorPalette="green" fontSize="2xs">Bullish</Badge></Table.Cell>
          </Table.Row>
        </Table.Body>
      </Table.Root>

      <Concept title="The Multiplier Effect" color="orange">
        <Text fontSize="xs" color="gray.400">
          1 call contract = 100 shares of delta exposure. If a customer buys 10,000 SPY calls (Δ ≈ 0.5),
          the MM must buy <strong>500,000 shares</strong> of SPY to hedge. On a stock trading 50M shares/day,
          that's 1% of daily volume — enough to move the price.
        </Text>
      </Concept>
    </Section>
  );
}

// ---------------------------------------------------------------------------
// Gamma Exposure (GEX)
// ---------------------------------------------------------------------------
function GammaExposureSection() {
  return (
    <Section title="5. Gamma Exposure (GEX) — The Market's Thermostat">
      <Text fontSize="sm" color="gray.300" mb={3}>
        <strong>GEX</strong> measures the total gamma that market makers hold across all strikes.
        It determines whether MMs amplify or dampen stock moves.
      </Text>

      <Grid templateColumns={{ base: '1fr', md: '1fr 1fr' }} gap={4} mb={4}>
        <Concept title="Positive GEX (Long Gamma)" color="green">
          <Text fontSize="xs" color="gray.400">
            MMs are <strong>long gamma</strong> → they hedge by buying dips and selling rips.<br />
            Effect: <strong>suppresses volatility</strong>, creates a "pin" around high-OI strikes.<br />
            The stock tends to mean-revert and chop in a range.<br />
            <em>Think: shock absorber.</em>
          </Text>
        </Concept>

        <Concept title="Negative GEX (Short Gamma)" color="red">
          <Text fontSize="xs" color="gray.400">
            MMs are <strong>short gamma</strong> → they must sell into dips and buy into rips.<br />
            Effect: <strong>amplifies volatility</strong>, creates trending moves and crashes.<br />
            The stock trends in one direction as hedging flows reinforce the move.<br />
            <em>Think: accelerant on a fire.</em>
          </Text>
        </Concept>
      </Grid>

      <Box bg="whiteAlpha.50" borderRadius="md" p={3} mb={4}>
        <Text fontSize="sm" fontWeight="bold" color={headingColor} mb={2}>GEX Calculation per Strike</Text>
        <Tex math="\text{GEX}_K = \Gamma_K \times \text{OI}_K \times 100 \times S^2 \times 0.01" display />
        <Text fontSize="2xs" color="gray.500" mt={1}>
          Gamma per option × open interest × 100 shares × S² × 1% move. Calls contribute positive GEX (MMs are typically short calls from customer buys),
          puts contribute negative GEX (MMs are typically long puts from customer sells). Total GEX = Σ across all strikes.
        </Text>
      </Box>

      <Concept title="The GEX Flip Point" color="yellow">
        <Text fontSize="xs" color="gray.400">
          The price level where total GEX crosses from positive to negative. Above this level, MMs dampen moves.
          Below it, they amplify. Many traders watch this as a key support/resistance indicator.
          Crossing below the flip point often precedes sharp selloffs as MM hedging switches from stabilizing to destabilizing.
        </Text>
      </Concept>
    </Section>
  );
}

// ---------------------------------------------------------------------------
// Vanna & Charm — Second-Order Flows
// ---------------------------------------------------------------------------
function VannaCharmSection() {
  return (
    <Section title="6. Vanna &amp; Charm — The Hidden Flows">
      <Text fontSize="sm" color="gray.300" mb={3}>
        Beyond delta and gamma, two second-order Greeks generate persistent directional flows as IV and time change.
        These are the "silent" forces that create slow, grinding trends in equities.
      </Text>

      <Grid templateColumns={{ base: '1fr', md: '1fr 1fr' }} gap={4} mb={4}>
        <Concept title="Vanna (∂Δ/∂σ)" color="purple">
          <Tex math="\text{Vanna} = \frac{\partial \Delta}{\partial \sigma} = \frac{\partial^2 V}{\partial S \, \partial \sigma}" display />
          <Text fontSize="xs" color="gray.400" mt={2}>
            As IV drops, delta of OTM calls decreases → MMs who are short calls can <strong>sell shares</strong> (less delta to hedge).<br />
            As IV rises, delta of OTM calls increases → MMs must <strong>buy shares</strong>.<br /><br />
            <strong>Typical flow:</strong> When VIX drops, vanna flows are bullish (MMs reduce hedges, but the unwind itself lifts prices).
            After a VIX spike, the vanna unwind creates a strong upward pull — "vol crush rallies."
          </Text>
        </Concept>

        <Concept title="Charm (∂Δ/∂t)" color="teal">
          <Tex math="\text{Charm} = -\frac{\partial \Delta}{\partial t} = -\frac{\partial \Theta}{\partial S}" display />
          <Text fontSize="xs" color="gray.400" mt={2}>
            As time passes, delta of OTM options decays toward 0, ITM toward ±1.<br />
            MMs holding short OTM calls see delta shrink daily → they <strong>sell shares</strong> each night to rebalance.<br /><br />
            <strong>Typical flow:</strong> Charm is a steady headwind or tailwind. With massive call OI, charm creates
            steady selling pressure as time erodes call deltas. This is one reason stocks sometimes drift down into opex.
          </Text>
        </Concept>
      </Grid>

      <Box bg="whiteAlpha.50" borderRadius="md" p={3}>
        <Text fontSize="sm" fontWeight="bold" color="yellow.300" mb={2}>Practical Impact</Text>
        <Text fontSize="xs" color="gray.400">
          Vanna and charm flows are largest 2-5 days before options expiration (OPEX). The
          "OPEX drift" pattern — where stocks tend to rally into monthly OPEX, then sell off after — is
          largely attributed to these flows. As options expire, the delta they carried vanishes, and the
          hedging shares are unwound, removing the supportive bid.
        </Text>
      </Box>
    </Section>
  );
}

// ---------------------------------------------------------------------------
// Options Expiration (OPEX) & Pin Risk
// ---------------------------------------------------------------------------
function OpexSection() {
  return (
    <Section title="7. OPEX &amp; Pin Risk — When Expiration Shapes Price">
      <Text fontSize="sm" color="gray.300" mb={3}>
        Options expiration (monthly, weekly, quarterly) is a major microstructure event. The sheer volume of contracts
        expiring creates mechanical flows that can override fundamental valuation for hours or days.
      </Text>

      <Grid templateColumns={{ base: '1fr', md: '1fr 1fr 1fr' }} gap={4} mb={4}>
        <Concept title="Max Pain" color="red">
          <Text fontSize="xs" color="gray.400">
            The strike price where total option holder losses are maximized (equivalently, where MMs profit the most).
            Stocks gravitate toward max pain as MMs' hedging activity pushes price toward the strike with highest OI.
            This isn't a conspiracy — it's gamma hedging math.
          </Text>
        </Concept>

        <Concept title="Pin Risk" color="yellow">
          <Text fontSize="xs" color="gray.400">
            Stocks "pin" to high-OI strikes because gamma explodes near expiry at ATM strikes.
            A tiny price move triggers massive hedging flow. MMs with short gamma at that strike
            buy on upticks and sell on downticks, creating a magnet effect.
          </Text>
        </Concept>

        <Concept title="Gamma Squeeze" color="orange">
          <Text fontSize="xs" color="gray.400">
            When a stock moves past a strike with heavy call OI, MMs must rapidly buy shares to hedge.
            Their buying pushes price higher, triggering hedging at the next strike, creating a feedback loop.
            GameStop (2021) and Tesla's "gamma ramps" are extreme examples.
          </Text>
        </Concept>
      </Grid>

      <Table.Root size="sm" variant="outline">
        <Table.Header>
          <Table.Row>
            <Table.ColumnHeader fontSize="xs">Event</Table.ColumnHeader>
            <Table.ColumnHeader fontSize="xs">Typical Effect</Table.ColumnHeader>
            <Table.ColumnHeader fontSize="xs">Why</Table.ColumnHeader>
          </Table.Row>
        </Table.Header>
        <Table.Body>
          <Table.Row>
            <Table.Cell fontSize="xs">Monthly OPEX (3rd Friday)</Table.Cell>
            <Table.Cell fontSize="xs">High volume, potential pin, volatility crush</Table.Cell>
            <Table.Cell fontSize="xs">Largest OI expires, massive delta unwind</Table.Cell>
          </Table.Row>
          <Table.Row>
            <Table.Cell fontSize="xs">Quarterly OPEX (Triple Witching)</Table.Cell>
            <Table.Cell fontSize="xs">Extreme volume, index rebalancing</Table.Cell>
            <Table.Cell fontSize="xs">Stock + index options + futures all expire simultaneously</Table.Cell>
          </Table.Row>
          <Table.Row>
            <Table.Cell fontSize="xs">0DTE (same-day expiry)</Table.Cell>
            <Table.Cell fontSize="xs">Intraday gamma spikes, rapid reversals</Table.Cell>
            <Table.Cell fontSize="xs">Gamma approaches infinity at ATM as T→0</Table.Cell>
          </Table.Row>
          <Table.Row>
            <Table.Cell fontSize="xs">Post-OPEX Monday</Table.Cell>
            <Table.Cell fontSize="xs">Often sharp moves, volatility expansion</Table.Cell>
            <Table.Cell fontSize="xs">Hedging flows removed → stock free to move on fundamentals</Table.Cell>
          </Table.Row>
        </Table.Body>
      </Table.Root>
    </Section>
  );
}

// ---------------------------------------------------------------------------
// Dark Pools & Off-Exchange
// ---------------------------------------------------------------------------
function DarkPoolsSection() {
  return (
    <Section title="8. Dark Pools &amp; Off-Exchange Trading">
      <Text fontSize="sm" color="gray.300" mb={3}>
        Not all trading happens on lit exchanges (NYSE, NASDAQ). ~40-50% of US equity volume
        goes through dark pools, internalizers, and wholesalers. This has major implications for price discovery.
      </Text>

      <Grid templateColumns={{ base: '1fr', md: '1fr 1fr' }} gap={4} mb={4}>
        <Concept title="Dark Pools" color="blue">
          <Text fontSize="xs" color="gray.400">
            Private venues where large orders match anonymously without showing on the public order book.
            Institutional traders use them to minimize price impact. The downside: less transparency means
            the lit order book may not reflect true supply/demand.
          </Text>
        </Concept>

        <Concept title="Payment for Order Flow (PFOF)" color="orange">
          <Text fontSize="xs" color="gray.400">
            Retail brokers (Robinhood, etc.) route orders to wholesalers (Citadel Securities, Virtu)
            who internalize trades. Retail orders never reach the exchange order book.
            The wholesaler profits from the spread; the broker gets paid per order.
            This means retail buying pressure may not directly impact the exchange price.
          </Text>
        </Concept>
      </Grid>

      <Concept title="Implications for Options Traders" color="yellow">
        <Text fontSize="xs" color="gray.400">
          When you see a stock with heavy dark pool prints at a certain level, it can act as support/resistance
          because institutions have established positions there. Dark pool volume at a price is "hidden inventory"
          that may need to be defended or unwound.
        </Text>
      </Concept>
    </Section>
  );
}

// ---------------------------------------------------------------------------
// Volatility Surface & Term Structure
// ---------------------------------------------------------------------------
function VolSurfaceSection() {
  return (
    <Section title="9. The Volatility Surface — IV Is Not Flat">
      <Text fontSize="sm" color="gray.300" mb={3}>
        Black-Scholes assumes constant volatility. Reality is more complex: implied volatility varies by strike (skew) and expiry (term structure).
        This surface encodes market expectations and supply/demand for protection.
      </Text>

      <Grid templateColumns={{ base: '1fr', md: '1fr 1fr 1fr' }} gap={4} mb={4}>
        <Concept title="Volatility Skew" color="purple">
          <Text fontSize="xs" color="gray.400">
            OTM puts have higher IV than OTM calls (in equities). Why?
            Demand for downside protection → puts are expensive.
            Sellers of puts demand higher premium → higher implied vol.
            <br /><br />
            The skew steepens when fear increases (crash risk premium).
          </Text>
        </Concept>

        <Concept title="Term Structure" color="teal">
          <Text fontSize="xs" color="gray.400">
            IV varies by expiration. Usually upward sloping (longer = more uncertainty).
            Inverts during crises: near-term IV spikes above long-term.
            Calendar spreads exploit term structure differences.
          </Text>
        </Concept>

        <Concept title="Volatility Smile" color="blue">
          <Text fontSize="xs" color="gray.400">
            In indices: a "smirk" (puts more expensive).
            In single stocks: more symmetric "smile" (tail risk on both sides for M&A, earnings).
            In FX: nearly symmetric smile.
            <br /><br />
            The shape tells you what risks the market is pricing.
          </Text>
        </Concept>
      </Grid>

      <Box bg="whiteAlpha.50" borderRadius="md" p={3}>
        <Text fontSize="sm" fontWeight="bold" color="yellow.300" mb={2}>Trading the Surface</Text>
        <Text fontSize="xs" color="gray.400">
          <strong>Skew trades:</strong> Risk reversals (sell OTM put, buy OTM call) bet that skew is too steep.<br />
          <strong>Term structure trades:</strong> Calendar spreads (sell near-dated, buy far-dated) profit if near IV drops faster.<br />
          <strong>Butterfly spreads:</strong> Bet on the curvature (kurtosis) of the vol surface.
        </Text>
      </Box>
    </Section>
  );
}

// ---------------------------------------------------------------------------
// 0DTE & the Gamma Regime
// ---------------------------------------------------------------------------
function ZeroDTESection() {
  return (
    <Section title="10. The 0DTE Revolution">
      <Text fontSize="sm" color="gray.300" mb={3}>
        Zero-days-to-expiration options now account for ~50% of SPX options volume. These have fundamentally
        changed market microstructure by introducing massive, rapidly-decaying gamma into the system every single day.
      </Text>

      <Grid templateColumns={{ base: '1fr', md: '1fr 1fr' }} gap={4} mb={4}>
        <Concept title="Why 0DTE Matters" color="red">
          <Text fontSize="xs" color="gray.400">
            Gamma of ATM options scales as <Tex math="\Gamma \propto \frac{1}{\sigma\sqrt{T}}" />.
            As T → 0, gamma explodes. A 0DTE ATM option has 5-10x the gamma of a 30-day option at the same strike.
            <br /><br />
            This means MMs must hedge much more aggressively for each dollar of 0DTE OI, creating outsized intraday flows.
          </Text>
        </Concept>

        <Concept title="Intraday Dynamics" color="orange">
          <Text fontSize="xs" color="gray.400">
            <strong>Morning:</strong> 0DTE positions are established → hedging flow begins.<br />
            <strong>Midday:</strong> Theta burns rapidly, delta shifts → continuous rehedging.<br />
            <strong>3:30-4pm:</strong> Gamma peaks, any move near a big strike triggers massive hedging → sharp reversals or acceleration.
          </Text>
        </Concept>
      </Grid>

      <Concept title="Impact on Realized Volatility" color="yellow">
        <Text fontSize="xs" color="gray.400">
          Paradoxically, 0DTE can both suppress and amplify volatility. When most 0DTE flow is <em>selling</em> (collecting premium),
          MMs are long gamma → they dampen moves, creating low intraday realized vol. But if a move triggers stop-outs
          or a shift to call/put buying, the gamma feedback loop can create violent intraday swings.
          The VIX may look calm while intraday ranges are wild — the "vol of vol" has increased.
        </Text>
      </Concept>
    </Section>
  );
}

// ---------------------------------------------------------------------------
// Putting It Together — How to Use This
// ---------------------------------------------------------------------------
function SynthesisSection() {
  return (
    <Section title="11. Putting It All Together — Reading the Flow">
      <Text fontSize="sm" color="gray.300" mb={3}>
        Market microstructure isn't just theory — it gives you a practical framework for understanding
        why prices do what they do, and when mechanical flows override fundamentals.
      </Text>

      <Table.Root size="sm" variant="outline" mb={4}>
        <Table.Header>
          <Table.Row>
            <Table.ColumnHeader fontSize="xs">Signal</Table.ColumnHeader>
            <Table.ColumnHeader fontSize="xs">What to Look For</Table.ColumnHeader>
            <Table.ColumnHeader fontSize="xs">Implication</Table.ColumnHeader>
          </Table.Row>
        </Table.Header>
        <Table.Body>
          <Table.Row>
            <Table.Cell fontSize="xs">GEX Positive & High</Table.Cell>
            <Table.Cell fontSize="xs">Total GEX well above zero</Table.Cell>
            <Table.Cell fontSize="xs">Low vol regime, mean-reversion, stock pins to strikes. Sell premium.</Table.Cell>
          </Table.Row>
          <Table.Row>
            <Table.Cell fontSize="xs">GEX Negative</Table.Cell>
            <Table.Cell fontSize="xs">GEX below zero or flip point breached</Table.Cell>
            <Table.Cell fontSize="xs">High vol, trending moves. Buy protection or ride momentum.</Table.Cell>
          </Table.Row>
          <Table.Row>
            <Table.Cell fontSize="xs">VIX Crush</Table.Cell>
            <Table.Cell fontSize="xs">VIX dropping rapidly</Table.Cell>
            <Table.Cell fontSize="xs">Vanna flows push stocks higher. Bullish tilt.</Table.Cell>
          </Table.Row>
          <Table.Row>
            <Table.Cell fontSize="xs">Heavy Call OI at Strike</Table.Cell>
            <Table.Cell fontSize="xs">Unusually high OI at a specific call strike</Table.Cell>
            <Table.Cell fontSize="xs">Potential gamma ramp if approached. Magnetic pin if at ATM.</Table.Cell>
          </Table.Row>
          <Table.Row>
            <Table.Cell fontSize="xs">OPEX Week</Table.Cell>
            <Table.Cell fontSize="xs">3-5 days before monthly expiration</Table.Cell>
            <Table.Cell fontSize="xs">Charm/vanna flows strongest. Drift toward max pain. Post-OPEX volatility.</Table.Cell>
          </Table.Row>
          <Table.Row>
            <Table.Cell fontSize="xs">0DTE Surge</Table.Cell>
            <Table.Cell fontSize="xs">Elevated 0DTE volume vs. normal</Table.Cell>
            <Table.Cell fontSize="xs">Intraday gamma amplification. Watch for sharp 3:30pm moves.</Table.Cell>
          </Table.Row>
          <Table.Row>
            <Table.Cell fontSize="xs">Skew Steepening</Table.Cell>
            <Table.Cell fontSize="xs">Put IV rising faster than call IV</Table.Cell>
            <Table.Cell fontSize="xs">Increasing crash risk premium. Institutions buying protection.</Table.Cell>
          </Table.Row>
        </Table.Body>
      </Table.Root>

      <Box bg="whiteAlpha.50" borderRadius="md" p={3}>
        <Text fontSize="sm" fontWeight="bold" color="cyan.300" mb={2}>The Feedback Loop</Text>
        <HStack gap={2} wrap="wrap" mb={2}>
          {['Options Flow', '→ MM Hedging', '→ Stock Price Move', '→ Delta Change', '→ More Hedging', '→ ∞'].map((step, i) => (
            <Badge key={i} variant="subtle" colorPalette={i % 2 === 0 ? 'blue' : 'purple'} fontSize="xs">
              {step}
            </Badge>
          ))}
        </HStack>
        <Text fontSize="xs" color="gray.400">
          This is the central insight: options are not just derivative bets — they are <strong>generators of stock order flow</strong>.
          The tail wags the dog. Understanding who holds what gamma, at which strikes, and when it expires,
          gives you a structural edge in reading price action.
        </Text>
      </Box>
    </Section>
  );
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------
export default function MarketMicrostructure() {
  const navigate = useNavigate();

  return (
    <Box p={{ base: 2, md: 4 }} maxW="1400px" mx="auto">
      <Flex align="center" mb={4} gap={3}>
        <Button variant="ghost" size="sm" onClick={() => navigate('/investing')}>
          <ArrowLeft size={18} />
        </Button>
        <Heading size="lg" color={headingColor}>Market Microstructure</Heading>
      </Flex>
      <Text fontSize="sm" color="gray.400" mb={6}>
        How the mechanics of order execution, market making, and options hedging influence stock and option prices.
      </Text>

      <VStack gap={4} align="stretch">
        <ExchangeArchitectureSection />
        <OrderBookSection />
        <MarketMakersSection />
        <DeltaHedgingImpactSection />
        <GammaExposureSection />
        <VannaCharmSection />
        <OpexSection />
        <DarkPoolsSection />
        <VolSurfaceSection />
        <ZeroDTESection />
        <SynthesisSection />
      </VStack>
    </Box>
  );
}
