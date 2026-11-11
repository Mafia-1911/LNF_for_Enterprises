// The 30-second how-to behind the Help button on every screen (SRS authority interface). Keyed by
// the screen's title (router staticData.title). Three or four short steps each, plain words.
export type HowTo = { title: string; steps: string[] };

const HELP: Record<string, HowTo> = {
  Home: {
    title: 'Getting started',
    steps: [
      'Lost something? Tap "I lost something" and answer four short questions.',
      'Found something? Tap "I found something", then bring it to the Lost & Found office.',
      'We tell you in Alerts (and by email) when something like your item reaches the desk.',
    ],
  },
  'I lost something': {
    title: 'Report a lost item',
    steps: [
      'Pick what it is, then its colour and brand.',
      'Add a detail only you would know (it stays private, staff only).',
      'Say where and when you last had it. Your draft saves as you go.',
      'Submit. The report stays open 30 days and you get an alert for every likely match.',
    ],
  },
  'I found something': {
    title: 'Report a found item',
    steps: [
      'Take a photo, pick what it is, and say where and when you found it.',
      'If a lost report looks like it, tap "This might be theirs" to tell the owner anonymously.',
      'Bring the item to the desk within 48 hours and show the QR code.',
    ],
  },
  Gallery: {
    title: 'Browse found items',
    steps: [
      'Search by words, or filter by category, building and date.',
      'Sensitive items (cards, cash, documents) show an icon only.',
      'Open an item and tap "This is mine" to claim it.',
    ],
  },
  'Found item': {
    title: 'Claim an item',
    steps: [
      'Answer the questions about details only the owner would know.',
      'The desk compares your answers with what was recorded at intake.',
      'If approved, you get a 6-digit pickup code. Bring it and your ID.',
    ],
  },
  'My claim': {
    title: 'Your claim',
    steps: [
      'The track shows where your claim is: submitted, checked, ready, collected.',
      'Once approved, the pickup code and the last day to collect show here.',
      "Can't come? Nominate someone by university ID. Think a decision is wrong? Tap Dispute.",
    ],
  },
  'My lost report': {
    title: 'Your lost report',
    steps: [
      'Likely matches at the desk are listed with plain reasons, e.g. "Same colour".',
      'Renew with one tap before it expires (twice at most).',
      'Found it yourself? Tap "I found it myself" to close it.',
    ],
  },
  'My activity': {
    title: 'Your activity',
    steps: [
      'Lost reports, found posts and claims are on separate tabs.',
      'Open any of them to see its status and what happens next.',
    ],
  },
  Alerts: {
    title: 'Alerts',
    steps: [
      'Matches, arrivals at the desk, claim decisions and reminders appear here.',
      'University accounts also get each alert by email.',
    ],
  },
  Desk: {
    title: 'The desk in 30 seconds',
    steps: [
      'Log a found item: photo, what it is, where found, bin. A label prints.',
      'Hand an item back: type the pickup code, check the ID, ask for a signature.',
      'Check claims: compare answers with what was recorded, then approve or reject.',
      'Today on the right lists what needs doing: shelving, reviews, pickups, expiries.',
    ],
  },
  'Log a found item': {
    title: 'Log a found item',
    steps: [
      'Step 1: pick what it is. Step 2: colour, short name, where and when found.',
      'Step 3: tick private details (they become claim questions). Step 4: the bin.',
      'Save, print the label, and put the item in the bin shown.',
    ],
  },
  'Find an item': {
    title: 'Find an item',
    steps: [
      'Type any ID (dashes optional) or a few words, e.g. "black umbrella".',
      'Switch to "All" to include returned and closed items.',
    ],
  },
  'Check claims': {
    title: 'Check claims',
    steps: [
      'Items with waiting claims are listed with their review deadline.',
      'Open one to see every claim side by side with what was recorded at intake.',
    ],
  },
  'Review claims': {
    title: 'Review a claim',
    steps: [
      'Mark each answer Pass or Fail against the recorded details.',
      'Approve only when every answer passes; the other claims are closed.',
      'Not sure? Ask for more: the claimant answers your question.',
    ],
  },
  'Hand an item back': {
    title: 'Hand an item back',
    steps: [
      'Type the 6-digit pickup code, then fetch the item from the bin shown.',
      "Check the person against their ID and type the ID's last 4.",
      'High-value item? Record a second check or ask a supervisor. Then they sign.',
    ],
  },
  More: {
    title: 'More desk tools',
    steps: [
      'Outage label sheets: print IDs before a power or internet cut.',
      'Help a walk-in student: file a lost report or a claim for someone without a phone.',
      'Practice mode: train on sample data without touching real records.',
    ],
  },
  'Outage label sheets': {
    title: 'Outage label sheets',
    steps: [
      'Reserve and print labels now, before you need them.',
      'During an outage, stick a label on the item and write the time and bin.',
      'Afterwards, tap "Enter now" on that label and type the time it was tagged.',
    ],
  },
  'Daily shelf check': {
    title: 'Daily shelf check',
    steps: [
      'Go bin by bin. Every item the system expects in the bin is listed.',
      'Leave items you can see as Present; tap Missing for anything that is not there.',
      'Save. Missing items are recorded on their history so the desk can look for them.',
    ],
  },
  'Help a walk-in student': {
    title: 'Help a walk-in student',
    steps: [
      "Type the student's university email (they must have signed in once).",
      'Lost something: fill the lost report with them. It belongs to them and they get the alerts.',
      'Claiming an item we hold: type the FND ID, ask the questions shown and type their answers.',
      'The claim is theirs: they get the decision and the pickup code by alert.',
    ],
  },
  Overview: {
    title: 'Supervisor overview',
    steps: [
      'The four numbers show custody, reviews, returns and what expires this week.',
      '"Needs your decision" lists retention, disputes, approvals and overdue reviews.',
      'The sidebar badges count what is waiting on each page.',
    ],
  },
  'Retention & disposal': {
    title: 'Retention & disposal',
    steps: [
      'Items past retention wait here for a decision.',
      'Select one or many, then Donate, Transfer or Dispose, with a note.',
      '"Keep longer" gives an item 30 more days.',
    ],
  },
  'Dispatch directory': {
    title: 'Dispatch directory',
    steps: [
      'Search every handover by DSP or FND ID, claimant name or ID last 4.',
      'CSV downloads the list; PDF prints it.',
      'Open a record to see its history and add a correction with a reason.',
    ],
  },
  Disputes: {
    title: 'Disputes',
    steps: [
      'Read the statement and open the handover record and its history.',
      'Add notes as you check; they are never edited.',
      'Uphold or reject. Flag the recipient if the wrong person got the item.',
    ],
  },
  Policies: {
    title: 'Policies',
    steps: [
      'Change retention, the pickup window and the claim cap; they apply straight away.',
      'Add closures and semester breaks: retention pauses on those days.',
    ],
  },
  Staff: {
    title: 'Staff',
    steps: [
      'Add a desk officer or supervisor by university email.',
      'They get desk access the next time they sign in with single sign-on.',
    ],
  },
};

const GENERAL: HowTo = {
  title: 'Help',
  steps: [
    'Every screen has one main task; the title says what it is.',
    'Errors say what happened and what to do next.',
    'Stuck? Ask at the Lost & Found office.',
  ],
};

export function howToFor(title: string | undefined): HowTo {
  return (title && HELP[title]) || GENERAL;
}
