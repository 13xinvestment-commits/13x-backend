require('dotenv').config();
const supabase = require('./config/supabase');

const SAMPLE_COMPANIES_DATA = {
  'INFY': {
    top_trigger: 'Deal pipeline accelerates in BFSI segment with US client renewals and AI integrations.',
    catalyst_tags: ['new_products', 'margin_expansion'],
    score: 4,
    stage: 'acceleration',
    triggers: [
      { trigger_text: 'BFSI segment shows revival signs with three mega deal signings valued over $150M each.', catalyst_type: 'new_products', conviction_score: 5, source_quote: 'We are seeing client decision making cycles shorten in BFSI, leading to immediate deal ramp ups.' },
      { trigger_text: 'Expansion of Topaz AI suite across European banking clients expected to drive high-margin revenues.', catalyst_type: 'new_products', conviction_score: 4, source_quote: 'European clients are adopting our Topaz AI capabilities at a faster clip, which helps margins.' },
      { trigger_text: 'Subcontractor costs expected to decline by 150-200 bps in next 2 quarters, driving margin expansion.', catalyst_type: 'margin_expansion', conviction_score: 4, source_quote: 'We are actively replacing expensive subcontractors with internal lateral hires to optimize costs.' }
    ],
    signals: [
      { signal_type: 'guidance', quarter: 'Q4FY26', content: 'Management guides for 7-9% revenue growth in constant currency for FY27.', confidence: 4, source: 'Q4 FY26 Earnings Call Transcript' },
      { signal_type: 'margin', quarter: 'Q4FY26', content: 'Operating margin guidance set at 20-22% driven by cost optimization program Project Horizon.', confidence: 5, source: 'Q4 FY26 Earnings Call Transcript' },
      { signal_type: 'expansion', quarter: 'Q4FY26', content: 'Opening two new delivery centers in Poland and Ireland to cater to European banking clients.', confidence: 4, source: 'Q4 FY26 Press Release' }
    ],
    snapshot: {
      revenue_trend: 'up',
      margin_trend: 'up',
      tone: 'positive',
      guidance_summary: 'Revenue growth guided at 7-9% CC for FY27. EBIT margins expected between 20-22%. Generative AI deal pipeline is now exceeding $1.2B in active discussions.',
      capex_commentary: 'Capital expenditure for FY27 planned at ₹2,200 crore, primarily directed towards infrastructure upgrades and AI compute capacities.',
      risks: 'Wage inflation pressure in Eastern Europe, potential delays in decision making for retail clients, and geopolitical disruptions.',
      key_quotes: [
        { text: 'The structural demand for AI-driven transformation is strong. Topaz is opening doors in clients we never had access to.', speaker: 'Salil Parekh, CEO', quarter: 'Q4FY26' },
        { text: 'EBIT margins improved by 40 bps sequentially, reflecting our rigorous cost management programs.', speaker: 'Jayesh Sanghrajka, CFO', quarter: 'Q4FY26' }
      ]
    }
  },
  'PARAS': {
    top_trigger: 'Execution of ₹600 crore electro-optics order starting Q1 FY27, boosting defence electronics revenue.',
    catalyst_tags: ['capex', 'new_products'],
    score: 5,
    stage: 'early_growth',
    triggers: [
      { trigger_text: 'Commencing production of state-of-the-art thermal imaging systems for infantry combat vehicles.', catalyst_type: 'new_products', conviction_score: 5, source_quote: 'Our electro-optics division is now fully certified, and serial production for the main order starts next quarter.' },
      { trigger_text: 'Setting up new manufacturing facility in Bangalore for space-grade optics assembly.', catalyst_type: 'capex', conviction_score: 4, source_quote: 'Bangalore space optics facility will double our capacity for clean-room assembly.' },
      { trigger_text: 'Import substitution policy tailwind to boost local manufacturing share to 85% by FY28.', catalyst_type: 'operating_leverage', conviction_score: 5, source_quote: 'The import restrictions on sensors are a major win for us. We are the sole local supplier for multiple sensor suites.' }
    ],
    signals: [
      { signal_type: 'guidance', quarter: 'Q4FY26', content: 'Defence electronics revenue expected to double over the next two fiscal years.', confidence: 5, source: 'Q4 FY26 Call' },
      { signal_type: 'capex', quarter: 'Q4FY26', content: 'Investing ₹120 crore in advanced machinery and tooling for electro-optics.', confidence: 4, source: 'Q4 FY26 Call' },
      { signal_type: 'risk', quarter: 'Q4FY26', content: 'Raw material procurement delays from specialized international optical glass suppliers.', confidence: 3, source: 'Q4 FY26 Call' }
    ],
    snapshot: {
      revenue_trend: 'up',
      margin_trend: 'up',
      tone: 'positive',
      guidance_summary: 'Targeting 25-30% revenue growth for FY27. EBITDA margins to expand by 150-200 bps due to higher indigenization. Order book stands at ₹850 crore with 3-year visibility.',
      capex_commentary: 'Bangalore expansion and clean-room tooling will consume ₹45 crore of capex in H1 FY27.',
      risks: 'Delays in government budget releases, supply constraints on imported raw optical materials, and high employee attrition in optics design team.',
      key_quotes: [
        { text: 'We are moving from component supply to complete systems integration. This shifts our margin profile significantly upwards.', speaker: 'Amit Mahajan, Director', quarter: 'Q4FY26' },
        { text: 'Order pipeline is robust. We are actively bidding for projects worth ₹1,200 crore.', speaker: 'Sajal Kishore, CFO', quarter: 'Q4FY26' }
      ]
    }
  },
  'IREDA': {
    top_trigger: 'Cost of borrowing decreases by 30 bps via green bond issuances, increasing net interest margin.',
    catalyst_tags: ['geographic_expansion', 'operating_leverage'],
    score: 5,
    stage: 'early_growth',
    triggers: [
      { trigger_text: 'Issuing $500M international green bonds to reduce average borrowing cost to sub-7.2%.', catalyst_type: 'operating_leverage', conviction_score: 5, source_quote: 'Our green bond roadshows received overwhelming response. This lowers our cost of funds significantly.' },
      { trigger_text: 'Expanding lending operations to offshore wind and green hydrogen storage projects.', catalyst_type: 'geographic_expansion', conviction_score: 4, source_quote: 'Offshore wind and green hydrogen represent high-yield lending opportunities that we are exploring.' },
      { trigger_text: 'Loan book expected to cross ₹95,000 crore by FY27, maintaining sub-1% net NPA.', catalyst_type: 'operating_leverage', conviction_score: 5, source_quote: 'Credit quality remains stellar. Loan book expansion is fully backed by secure government contracts.' }
    ],
    signals: [
      { signal_type: 'guidance', quarter: 'Q4FY26', content: 'Loan book growth targeted at 25% year-on-year for the next three years.', confidence: 5, source: 'Q4 FY26 Concall' },
      { signal_type: 'margin', quarter: 'Q4FY26', content: 'Net Interest Margin (NIM) guided to remain robust between 3.4% and 3.6%.', confidence: 4, source: 'Q4 FY26 Concall' }
    ],
    snapshot: {
      revenue_trend: 'up',
      margin_trend: 'stable',
      tone: 'positive',
      guidance_summary: 'Targeting 25%+ loan book CAGR. Spreads to remain stable at 2.4-2.5%. Asset quality continues to improve with Net NPAs below 0.9%. Capital adequacy is strong at 20.1%.',
      capex_commentary: 'N/A as a financial institution.',
      risks: 'Rising competitive intensity from commercial banks in solar projects, sudden interest rate spikes, and policy changes in renewable tariffs.',
      key_quotes: [
        { text: 'We are the primary engine of green finance in India. The solar rooftop and PM-KUSUM programs are driving retail growth.', speaker: 'Pradip Kumar Das, CMD', quarter: 'Q4FY26' }
      ]
    }
  },
  'DATAPATTNS': {
    top_trigger: 'Setting up testing facility for satellite payloads, expanding defence electronics capability.',
    catalyst_tags: ['capex', 'operating_leverage'],
    score: 4,
    stage: 'early_growth',
    triggers: [
      { trigger_text: 'Investment of ₹80 crore in advanced testing chambers for radar and EW systems.', catalyst_type: 'capex', conviction_score: 4, source_quote: 'The radar testing chambers are going live in H2, reducing reliance on third-party government labs.' },
      { trigger_text: 'Operating leverage kicking in as production shifts from development phase to serial production.', catalyst_type: 'operating_leverage', conviction_score: 5, source_quote: 'As development projects mature into serial production, gross margins expand from 65% to 70%.' }
    ],
    signals: [
      { signal_type: 'guidance', quarter: 'Q4FY26', content: 'Targeting 30-35% revenue growth in defence electronics for FY27.', confidence: 4, source: 'Q4 FY26 Call' },
      { signal_type: 'capex', quarter: 'Q4FY26', content: 'Testing facility capex will consume ₹50 crore in H1 FY27.', confidence: 5, source: 'Q4 FY26 Call' }
    ],
    snapshot: {
      revenue_trend: 'up',
      margin_trend: 'up',
      tone: 'positive',
      guidance_summary: 'Guiding for ₹550-600 crore revenue in FY27. EBITDA margins expected to remain high at 38-40%. Space program products will contribute 10% of revenue.',
      capex_commentary: 'Total capex for the year planned at ₹70 crore, including lab instruments and clean-room upgrades.',
      risks: 'Slower-than-expected government orders, supply chain delays for imported FPGA semiconductors, and rising salary costs for RF design engineers.',
      key_quotes: [
        { text: 'Our custom design library allows us to build radar components in half the time. This is our core competitive advantage.', speaker: 'Srinivasagopalan Rangarajan, MD', quarter: 'Q4FY26' }
      ]
    }
  },
  'INOXINDIA': {
    top_trigger: 'Export order book expands for cryogenic containers to North American and European industrial clients.',
    catalyst_tags: ['geographic_expansion', 'margin_expansion'],
    score: 4,
    stage: 'acceleration',
    triggers: [
      { trigger_text: 'Expanding footprint in international markets for liquid hydrogen and LNG tankers.', catalyst_type: 'geographic_expansion', conviction_score: 4, source_quote: 'The clean energy push in North America is driving high demand for our LNG storage solutions.' },
      { trigger_text: 'Favorable raw material (stainless steel) prices to drive margin improvement of 120 bps.', catalyst_type: 'margin_expansion', conviction_score: 4, source_quote: 'Raw material deflation is supporting margins, and we expect this trend to continue for at least two quarters.' }
    ],
    signals: [
      { signal_type: 'guidance', quarter: 'Q4FY26', content: 'Export revenues to form 45% of total sales in FY27, up from 38% in FY26.', confidence: 4, source: 'Q4 FY26 Call' },
      { signal_type: 'margin', quarter: 'Q4FY26', content: 'EBITDA margin expected to hold steady at 23-24% range.', confidence: 5, source: 'Q4 FY26 Call' }
    ],
    snapshot: {
      revenue_trend: 'up',
      margin_trend: 'up',
      tone: 'positive',
      guidance_summary: 'Targeting 20% revenue growth. Liquid hydrogen transport container pilot program completed, full commercial sales starting Q3 FY27.',
      capex_commentary: 'Capital expenditure of ₹35 crore for tooling and automation at Savli plant.',
      risks: 'High shipping freight rates affecting export margins, raw material price volatility, and currency fluctuations.',
      key_quotes: [
        { text: 'Hydrogen is the future, and we are already providing storage setups for multiple pilots in India and Europe.', speaker: 'Parag Kulkarni, CEO', quarter: 'Q4FY26' }
      ]
    }
  },
  'SWIGGY': {
    top_trigger: 'Instamart warehouse density optimization to drive quick-commerce EBITDA break-even by Q3 FY27.',
    catalyst_tags: ['margin_expansion', 'acquisitions'],
    score: 4,
    stage: 'early_growth',
    triggers: [
      { trigger_text: 'EBITDA break-even at store level in quick commerce (Instamart) via ad-revenue growth and better route density.', catalyst_type: 'margin_expansion', conviction_score: 5, source_quote: 'Our ad engine is ramping up well. Store level EBITDA in quick commerce is turning green in metro areas.' },
      { trigger_text: 'Integration of regional food delivery startups in southern markets expected to yield synergies.', catalyst_type: 'acquisitions', conviction_score: 3, source_quote: 'We will continue to acquire smaller delivery operators to build density and market share.' }
    ],
    signals: [
      { signal_type: 'guidance', quarter: 'Q4FY26', content: 'Quick commerce gross order value (GOV) targeted to grow at 40%+ CAGR.', confidence: 4, source: 'Q4 FY26 Call' },
      { signal_type: 'risk', quarter: 'Q4FY26', content: 'Delivery boy payout costs and fuel inflation could pressure margins.', confidence: 4, source: 'Q4 FY26 Call' }
    ],
    snapshot: {
      revenue_trend: 'up',
      margin_trend: 'up',
      tone: 'positive',
      guidance_summary: 'Food delivery GOV growth guided at 15-18%. Quick commerce to grow at 40%+. Advertising revenue to reach 10% of total revenue. Overall EBITDA loss margins narrowing.',
      capex_commentary: 'Investing ₹150 crore in dark store automation, tech infrastructure, and regional warehousing.',
      risks: 'Fierce competition from Zepto and Blinkit, high gig-worker attrition, and state regulations on delivery executive benefits.',
      key_quotes: [
        { text: 'Quick commerce is no longer just grocery. Electronics and cosmetics are driving average order values to record highs.', speaker: 'Sriharsha Majety, CEO', quarter: 'Q4FY26' }
      ]
    }
  },
  'ADANIGREEN': {
    top_trigger: 'Commissioning 2.5GW hybrid solar-wind capacity in Khavda, Gujarat by Q2 FY27.',
    catalyst_tags: ['capex', 'operating_leverage'],
    score: 5,
    stage: 'acceleration',
    triggers: [
      { trigger_text: 'Operationalizing massive solar-wind park at Khavda, generating long-term tariff revenues.', catalyst_type: 'capex', conviction_score: 5, source_quote: 'Khavda development is ahead of schedule. We will operationalize 2.5GW next quarter.' },
      { trigger_text: 'Refinancing existing high-cost loans to lower average interest rate by 80 bps.', catalyst_type: 'operating_leverage', conviction_score: 4, source_quote: 'We are in deep talks for cheaper refinancing. This will boost our net profits and credit rating.' }
    ],
    signals: [
      { signal_type: 'guidance', quarter: 'Q4FY26', content: 'Aiming to reach 30GW operational renewable capacity by 2030.', confidence: 5, source: 'Q4 FY26 Call' },
      { signal_type: 'capex', quarter: 'Q4FY26', content: 'Annual capex for power project installation set at ₹15,000 crore.', confidence: 5, source: 'Q4 FY26 Call' }
    ],
    snapshot: {
      revenue_trend: 'up',
      margin_trend: 'stable',
      tone: 'positive',
      guidance_summary: 'Targeting 5GW capacity addition annually. Long-term power purchase agreements (PPAs) signed for 90% of pipeline. Cash flow generation remains strong.',
      capex_commentary: '₹14,000 to ₹16,000 crore capex planned for solar modules, wind turbines, and transmission links.',
      risks: 'Grid connectivity transmission delays, module import duties, and weather dependencies affecting CUF.',
      key_quotes: [
        { text: 'We have the largest renewable energy pipeline in India. Khavda alone will change our scale of operations.', speaker: 'Amit Singh, CEO', quarter: 'Q4FY26' }
      ]
    }
  },
  'BEML': {
    top_trigger: 'Execution of Vande Bharat sleeper trainsets starting Q2 FY27, improving railway sector margin.',
    catalyst_tags: ['new_products', 'operating_leverage'],
    score: 3,
    stage: 'maturity',
    triggers: [
      { trigger_text: 'Delivery of first batch of Vande Bharat sleeper coach sets to Indian Railways.', catalyst_type: 'new_products', conviction_score: 4, source_quote: 'The trial runs for sleep coaches are complete. Commercial dispatches will begin in July.' },
      { trigger_text: 'Fixed cost absorption over higher volume of railway coach dispatches driving margin expansion.', catalyst_type: 'operating_leverage', conviction_score: 3, source_quote: 'Operating leverage will be highly visible as sleeper trainset production reaches peak capacity.' }
    ],
    signals: [
      { signal_type: 'guidance', quarter: 'Q4FY26', content: 'Targeting ₹4,800 crore revenue for FY27, up from ₹4,100 crore in FY26.', confidence: 4, source: 'Q4 FY26 Call' },
      { signal_type: 'risk', quarter: 'Q4FY26', content: 'Design modifications requested by railways could delay dispatches.', confidence: 3, source: 'Q4 FY26 Call' }
    ],
    snapshot: {
      revenue_trend: 'stable',
      margin_trend: 'up',
      tone: 'neutral',
      guidance_summary: 'Revenue growth of 15% guided. EBIT margins expected at 9-10% range. Defence division order flow is picking up but execution is skewed to H2.',
      capex_commentary: '₹80 crore allocated for tooling and line optimization at Kolar Gold Fields factory.',
      risks: 'Delayed payments from government departments, raw steel price hikes, and execution bottlenecks.',
      key_quotes: [
        { text: 'Vande Bharat sleeper is a landmark project. BEML is fully prepared to scale up dispatches.', speaker: 'Shantanu Roy, CMD', quarter: 'Q4FY26' }
      ]
    }
  },
  'IDEAFORGE': {
    top_trigger: 'Launch of drone-as-a-service (DaaS) model for mapping and security operations in forestry.',
    catalyst_tags: ['new_products', 'geographic_expansion'],
    score: 4,
    stage: 'early_growth',
    triggers: [
      { trigger_text: 'Rollout of long-range surveillance drones for defense and homeland security applications.', catalyst_type: 'new_products', conviction_score: 4, source_quote: 'Our new Netra 4 drone offers 20% longer flight times and has entered army field trials.' },
      { trigger_text: 'Acquiring overseas clients in the Middle East and Africa for border surveillance mapping.', catalyst_type: 'geographic_expansion', conviction_score: 3, source_quote: 'Middle East security tenders are a major focus for us in FY27.' }
    ],
    signals: [
      { signal_type: 'guidance', quarter: 'Q4FY26', content: 'Targeting 25% revenue growth driven by defense orders and DaaS services.', confidence: 4, source: 'Q4 FY26 Call' },
      { signal_type: 'risk', quarter: 'Q4FY26', content: 'Strict drone licensing policies and chip availability limitations.', confidence: 4, source: 'Q4 FY26 Call' }
    ],
    snapshot: {
      revenue_trend: 'up',
      margin_trend: 'stable',
      tone: 'positive',
      guidance_summary: 'DaaS model expected to reach 15% of revenues. Order backlog is comfortable at ₹120 crore. Defense sector tenders offer 2-year growth pipeline.',
      capex_commentary: '₹12 capex for R&D equipment and testing facilities in Mumbai.',
      risks: 'Delays in defense testing certifications, competition from cheaper Chinese imports, and chip supply bottlenecks.',
      key_quotes: [
        { text: 'We are shifting from pure hardware sales to SaaS-enabled services. This will bring recurring high-margin streams.', speaker: 'Ankit Mehta, CEO', quarter: 'Q4FY26' }
      ]
    }
  },
  'KAYNES': {
    top_trigger: 'Commercial production starts at OSAT semiconductor packaging facility in Gujarat in Q3 FY27.',
    catalyst_tags: ['capex', 'new_products'],
    score: 5,
    stage: 'acceleration',
    triggers: [
      { trigger_text: 'Commissioning semiconductor OSAT facility in Gujarat, offering chip packaging solutions.', catalyst_type: 'capex', conviction_score: 5, source_quote: 'Civil work is complete. Equipment installation starts next month. Production is on track for Q3.' },
      { trigger_text: 'Securing global automotive EMS export contracts from German Tier-1 suppliers.', catalyst_type: 'new_products', conviction_score: 4, source_quote: 'Automotive division is adding new electronic module manufacturing contracts for European EV programs.' }
    ],
    signals: [
      { signal_type: 'guidance', quarter: 'Q4FY26', content: 'EMS revenue expected to grow 40% driven by OSAT, industrial, and auto.', confidence: 5, source: 'Q4 FY26 Call' },
      { signal_type: 'capex', quarter: 'Q4FY26', content: 'Investing ₹800 crore in the semiconductor packaging division over 2 years.', confidence: 5, source: 'Q4 FY26 Call' }
    ],
    snapshot: {
      revenue_trend: 'up',
      margin_trend: 'up',
      tone: 'positive',
      guidance_summary: 'Guiding for ₹2,400 crore revenue in FY27. EBITDA margins to stay in the 14-15% range. Semiconductor OSAT project is highly accretive in long term.',
      capex_commentary: '₹450 crore allocated for FY27 capex, primarily for OSAT machinery and Mysore factory expansion.',
      risks: 'Delays in semiconductor testing equipment deliveries, global tech spending slowdown, and intense domestic competition.',
      key_quotes: [
        { text: 'We are one of the few Indian players entering semiconductor assembly. The demand is massive and we already have letters of intent.', speaker: 'Ramesh Kannan, MD', quarter: 'Q4FY26' }
      ]
    }
  },
  'PRAJIND': {
    top_trigger: 'Execution of multiple 2G ethanol plants and bio-SAF (sustainable aviation fuel) contracts.',
    catalyst_tags: ['new_products', 'geographic_expansion'],
    score: 4,
    stage: 'acceleration',
    triggers: [
      { trigger_text: 'Commercial rollout of sustainable aviation fuel (SAF) pilot plants in collaboration with Indian oil companies.', catalyst_type: 'new_products', conviction_score: 4, source_quote: 'SAF represents a massive global market. Our technology is fully tested and commercial orders have begun.' },
      { trigger_text: 'Expanding ethanol plant exports to South America (Brazil) and West Africa.', catalyst_type: 'geographic_expansion', conviction_score: 4, source_quote: 'Brazil mandates higher ethanol blends, opening up reactor export markets for us.' }
    ],
    signals: [
      { signal_type: 'guidance', quarter: 'Q4FY26', content: 'Bioenergy and engineering order flow expected to grow by 20% in FY27.', confidence: 4, source: 'Q4 FY26 Call' },
      { signal_type: 'margin', quarter: 'Q4FY26', content: 'Gross margin to benefit from cheaper steel and raw materials, target 40-42%.', confidence: 4, source: 'Q4 FY26 Call' }
    ],
    snapshot: {
      revenue_trend: 'up',
      margin_trend: 'up',
      tone: 'positive',
      guidance_summary: 'Order book stands at ₹3,200 crore. Breweries and water treatment divisions are growing at 15%. Bio-mobility solutions will be the key driver.',
      capex_commentary: '₹40 crore for modernization and digitizing R&D centers in Pune.',
      risks: 'Fluctuations in sugar cane raw material availability for clients, delayed local client capital spending, and international shipping logistics delays.',
      key_quotes: [
        { text: 'Bio-SAF is going to be the next big wave. Airlines have strict mandates, and our low-carbon ethanol conversion is leading.', speaker: 'Shishir Joshipura, CEO', quarter: 'Q4FY26' }
      ]
    }
  },
  'BIKAJI': {
    top_trigger: 'Geographic expansion in Northern and Western states with new contract packaging facilities.',
    catalyst_tags: ['geographic_expansion', 'margin_expansion'],
    score: 4,
    stage: 'early_growth',
    triggers: [
      { trigger_text: 'Setting up new manufacturing units in UP and Punjab to reduce logistics costs for northern markets.', catalyst_type: 'geographic_expansion', conviction_score: 5, source_quote: 'Northern packaging units will help us save 3% in shipping costs and capture regional demand.' },
      { trigger_text: 'Product mix shifting towards high-margin sweets and direct-to-consumer premium snack lines.', catalyst_type: 'margin_expansion', conviction_score: 4, source_quote: 'Premium offerings grew 30% this quarter, boosting gross margins.' }
    ],
    signals: [
      { signal_type: 'guidance', quarter: 'Q4FY26', content: 'Volume growth guided at 12-14% for the next fiscal year.', confidence: 5, source: 'Q4 FY26 Call' },
      { signal_type: 'margin', quarter: 'Q4FY26', content: 'EBITDA margin expected to hold steady in the 13-14% range.', confidence: 4, source: 'Q4 FY26 Call' }
    ],
    snapshot: {
      revenue_trend: 'up',
      margin_trend: 'stable',
      tone: 'positive',
      guidance_summary: 'Targeting mid-teen revenue growth. Premium sweet sales during festive seasons are expected to increase share in product mix. Rural demand is recovering.',
      capex_commentary: '₹90 crore allocated for UP factory commissioning and Western region storage units.',
      risks: 'Spikes in raw material prices (palm oil and chickpea flour), local brand competition, and supply chain disruptions.',
      key_quotes: [
        { text: 'Our brand recall in snacks is expanding rapidly outside Rajasthan. Northern market volumes are showing outstanding response.', speaker: 'Deepak Agarwal, MD', quarter: 'Q4FY26' }
      ]
    }
  },
  'DELTACORP': {
    top_trigger: 'Gaming tax rates normalisation and high footfall in Goa casinos boosting margins.',
    catalyst_tags: ['margin_expansion', 'operating_leverage'],
    score: 3,
    stage: 'maturity',
    triggers: [
      { trigger_text: 'Footfall in premium cruise vessels in Goa expected to return to pre-GST levels.', catalyst_type: 'operating_leverage', conviction_score: 4, source_quote: 'Casinos are seeing steady customer counts, and our VIP segment shows positive traction.' },
      { trigger_text: 'Corporate tax optimization and online gaming fee structures to support 100 bps margin recovery.', catalyst_type: 'margin_expansion', conviction_score: 3, source_quote: 'Cost optimizations in casino food, beverage and marketing will support EBITDA margins.' }
    ],
    signals: [
      { signal_type: 'guidance', quarter: 'Q4FY26', content: 'Casino business expected to stabilize in H1, with growth returning in H2 FY27.', confidence: 3, source: 'Q4 FY26 Call' },
      { signal_type: 'risk', quarter: 'Q4FY26', content: 'Regulatory GST tax revisions on online gaming remain a primary risk.', confidence: 5, source: 'Q4 FY26 Call' }
    ],
    snapshot: {
      revenue_trend: 'stable',
      margin_trend: 'stable',
      tone: 'neutral',
      guidance_summary: 'Overall business in consolidation phase. Online gaming (Adda52) focuses on user engagement, holding back heavy marketing spend to conserve cash flow.',
      capex_commentary: '₹15 crore capex for routine cruise ship maintenance and software platform updates.',
      risks: 'Government regulations on offshore casino licenses, online gaming tax burdens, and alternative gaming hubs.',
      key_quotes: [
        { text: 'We have taken the GST hit. The business is now structured for optimal costs, and high-net-worth customer spends are steady.', speaker: 'Jaydev Mody, Chairman', quarter: 'Q4FY26' }
      ]
    }
  },
  'ETHOSLTD': {
    top_trigger: 'Adding 12 new luxury watch boutiques in Tier-1 and Tier-2 cities in India in FY27.',
    catalyst_tags: ['geographic_expansion', 'new_products'],
    score: 4,
    stage: 'early_growth',
    triggers: [
      { trigger_text: 'Opening luxury boutiques in Ahmedabad, Lucknow, and Indore to capture rising luxury watch demand.', catalyst_type: 'geographic_expansion', conviction_score: 5, source_quote: 'Non-metro demand is surprising us. Tier-2 cities will contribute 25% of our new store additions.' },
      { trigger_text: 'Exclusive brand partnerships with premium Swiss brands driving higher average selling price.', catalyst_type: 'new_products', conviction_score: 4, source_quote: 'We secured exclusive rights for three more premium watch houses, which will command 20%+ margins.' }
    ],
    signals: [
      { signal_type: 'guidance', quarter: 'Q4FY26', content: 'Targeting 25-30% revenue growth for FY27 driven by store expansions.', confidence: 4, source: 'Q4 FY26 Call' },
      { signal_type: 'margin', quarter: 'Q4FY26', content: 'EBITDA margin guided to improve to 14.5-15% range.', confidence: 4, source: 'Q4 FY26 Call' }
    ],
    snapshot: {
      revenue_trend: 'up',
      margin_trend: 'up',
      tone: 'positive',
      guidance_summary: 'Guiding for 10-12 store additions in FY27. Average selling price (ASP) has increased by 15% sequentially. Certified pre-owned business growing at 50%.',
      capex_commentary: '₹35 crore capex for boutique interiors, security systems, and inventory setups.',
      risks: 'Import duties on luxury goods, high rental overheads in premium malls, and grey market supply competition.',
      key_quotes: [
        { text: 'Wealth creation in India is driving luxury watch adoption. Customers are willing to wait months for limited editions.', speaker: 'Yashovardhan Saboo, MD', quarter: 'Q4FY26' }
      ]
    }
  },
  'INOXWIND': {
    top_trigger: 'Execution of massive 1.5GW wind turbine order book as interest costs drop after debt repayment.',
    catalyst_tags: ['operating_leverage', 'capex'],
    score: 4,
    stage: 'acceleration',
    triggers: [
      { trigger_text: 'Serial dispatches of new 3MW wind turbine generator (WTG) platforms.', catalyst_type: 'new_products', conviction_score: 5, source_quote: 'Our 3MW WTGs are highly efficient and constitute 80% of our order dispatches next year.' },
      { trigger_text: 'Debt-free balance sheet post promoter equity infusion to save ₹120 crore in annual interest.', catalyst_type: 'operating_leverage', conviction_score: 5, source_quote: 'With zero net debt, our cash flow goes straight to working capital, accelerating manufacturing cycles.' }
    ],
    signals: [
      { signal_type: 'guidance', quarter: 'Q4FY26', content: 'Wind turbine dispatches targeted at 1.2GW in FY27, up from 700MW in FY26.', confidence: 5, source: 'Q4 FY26 Call' },
      { signal_type: 'margin', quarter: 'Q4FY26', content: 'EBITDA margins expected to rise to 15-16% due to scale and zero interest burden.', confidence: 5, source: 'Q4 FY26 Call' }
    ],
    snapshot: {
      revenue_trend: 'up',
      margin_trend: 'up',
      tone: 'positive',
      guidance_summary: 'Execution guidance raised to 1.2-1.4GW. Order book stands at a record 3.2GW. O&M subsidiary listing in pipeline to unlock further value.',
      capex_commentary: '₹60 crore capex for assembly line expansion and blade mold upgrades.',
      risks: 'Grid substation commissioning delays by NTPC/PGCIL, wind site land acquisition hurdles, and blade component supply shortages.',
      key_quotes: [
        { text: 'Inox Wind has turned around. We have a debt-free company and the largest order book in our history. Execution is the sole focus now.', speaker: 'Devansh Jain, Executive Director', quarter: 'Q4FY26' }
      ]
    }
  }
};

async function seed() {
  console.log('🌱 Starting DB Seeding with corrected trends...');
  
  for (const [ticker, mock] of Object.entries(SAMPLE_COMPANIES_DATA)) {
    console.log(`\nProcessing ${ticker}...`);
    
    // Find company
    const { data: company, error: coErr } = await supabase
      .from('companies')
      .select('id')
      .eq('ticker', ticker)
      .maybeSingle();
      
    if (coErr) {
      console.error(`Error finding ${ticker}:`, coErr.message);
      continue;
    }
    
    if (!company) {
      console.error(`Company with ticker ${ticker} not found in DB.`);
      continue;
    }
    
    const companyId = company.id;
    
    // Update company header columns
    const { error: upErr } = await supabase
      .from('companies')
      .update({
        top_trigger: mock.top_trigger,
        catalyst_tags: mock.catalyst_tags,
        score: mock.score,
        stage: mock.stage,
        is_sample: true,
        updated_at: new Date().toISOString()
      })
      .eq('id', companyId);
      
    if (upErr) {
      console.error(`Error updating company ${ticker}:`, upErr.message);
      continue;
    }
    console.log(`Updated company headers for ${ticker}.`);
    
    // Clean old triggers, signals, snapshots for this company
    await supabase.from('triggers').delete().eq('company_id', companyId);
    await supabase.from('signals').delete().eq('company_id', companyId);
    await supabase.from('concall_snapshots').delete().eq('company_id', companyId);
    
    // Insert triggers
    if (mock.triggers && mock.triggers.length > 0) {
      const trigData = mock.triggers.map(t => ({
        company_id: companyId,
        quarter: 'Q4FY26',
        trigger_text: t.trigger_text,
        catalyst_type: t.catalyst_type,
        conviction_score: t.conviction_score,
        source_quote: t.source_quote
      }));
      
      const { error: tErr } = await supabase.from('triggers').insert(trigData);
      if (tErr) console.error(`Error seeding triggers for ${ticker}:`, tErr.message);
      else console.log(`Seeded ${mock.triggers.length} triggers.`);
    }
    
    // Insert signals
    if (mock.signals && mock.signals.length > 0) {
      const sigData = mock.signals.map(s => ({
        company_id: companyId,
        quarter: s.quarter,
        signal_type: s.signal_type,
        content: s.content,
        confidence: s.confidence,
        source: s.source
      }));
      
      const { error: sErr } = await supabase.from('signals').insert(sigData);
      if (sErr) console.error(`Error seeding signals for ${ticker}:`, sErr.message);
      else console.log(`Seeded ${mock.signals.length} signals.`);
    }
    
    // Insert concall snapshot
    if (mock.snapshot) {
      const { error: snapErr } = await supabase.from('concall_snapshots').insert({
        company_id: companyId,
        quarter: 'Q4FY26',
        revenue_trend: mock.snapshot.revenue_trend,
        margin_trend: mock.snapshot.margin_trend,
        tone: mock.snapshot.tone,
        guidance_summary: mock.snapshot.guidance_summary,
        capex_commentary: mock.snapshot.capex_commentary,
        risks: mock.snapshot.risks,
        key_quotes: mock.snapshot.key_quotes,
        created_at: new Date().toISOString()
      });
      if (snapErr) console.error(`Error seeding snapshot for ${ticker}:`, snapErr.message);
      else console.log(`Seeded concall snapshot.`);
    }
  }
  
  console.log('\n🎉 DB Seeding Completed Successfully!');
}

seed().catch(console.error);
