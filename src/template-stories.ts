export interface StoryItem { label: string; text: string; number?: string }
export interface StoryScene {
  chapter: string;
  seconds: number;
  layout: 'hero' | 'split' | 'cards' | 'code' | 'closing';
  title: string;
  body: string;
  items?: StoryItem[];
  code?: string;
  note?: string;
}

export const MALAYSIA_STORY: StoryScene[] = [
  { chapter: 'Selamat datang', seconds: 8, layout: 'hero', title: 'Many stories.\nOne Malaysia.', body: 'A meeting place of cities, cultures,\nand extraordinary landscapes.', note: 'SELAMAT DATANG / WELCOME' },
  { chapter: 'Meet Malaysia', seconds: 10, layout: 'cards', title: 'One country. Many perspectives.', body: 'Get to know the places behind the name.', items: [
    { number: '01', label: 'Kuala Lumpur', text: 'The national capital, where towers\nand neighbourhood streets meet.' },
    { number: '02', label: 'Peninsular Malaysia', text: 'Cities, coastlines, and highlands\non the Malay Peninsula.' },
    { number: '03', label: 'Malaysian Borneo', text: 'Sabah and Sarawak, across\nthe South China Sea.' }
  ] },
  { chapter: 'City stories', seconds: 10, layout: 'split', title: 'Look up.\nThen look closer.', body: 'Kuala Lumpur pairs a modern skyline\nwith markets, food stalls, and\neveryday neighbourhood life.', items: [
    { label: 'THE SKYLINE', text: 'The Petronas Twin Towers\nare a landmark of the city.' },
    { label: 'THE STREET', text: 'Neighbourhood streets reveal\na different rhythm below.' }
  ], note: 'KUALA LUMPUR / CITY STORIES' },
  { chapter: 'Living heritage', seconds: 10, layout: 'cards', title: 'Heritage is still happening.', body: 'Architecture, craft, and daily routines keep stories alive.', items: [
    { number: '01', label: 'George Town', text: 'Historic streets and shophouses\nin Penang.' },
    { number: '02', label: 'Melaka', text: 'A port city shaped by centuries\nof trade and exchange.' },
    { number: '03', label: 'Everyday craft', text: 'Batik, weaving, and local makers\nconnect the past to the present.' }
  ] },
  { chapter: 'Beyond the skyline', seconds: 10, layout: 'split', title: 'Make room\nfor the outdoors.', body: 'Malaysia is more than its cities.\nRainforests, islands, and mountain\nlandscapes tell another story.', items: [
    { label: 'SABAH', text: 'Mount Kinabalu and the\nlandscapes of northern Borneo.' },
    { label: 'SARAWAK', text: 'Rainforest environments and\na rich range of local cultures.' }
  ], note: 'APPRECIATE NATURE / RESPECT LOCAL GUIDANCE' },
  { chapter: 'Culture in the everyday', seconds: 10, layout: 'cards', title: 'Different traditions. Shared spaces.', body: 'No single image can represent every Malaysian experience.', items: [
    { number: '01', label: 'Language', text: 'Bahasa Melayu is the national\nlanguage; many others are spoken.' },
    { number: '02', label: 'Celebration', text: 'Hari Raya, Chinese New Year,\nDeepavali, Gawai, and Kaamatan.' },
    { number: '03', label: 'Community', text: 'Listen to local stories. Learn\nhow people describe their home.' }
  ] },
  { chapter: 'A seat at the table', seconds: 10, layout: 'split', title: 'Start a conversation\nover a meal.', body: 'Food is one way to explore the\ncountry, from breakfast stalls\nto a shared evening table.', items: [
    { label: 'TRY THE EVERYDAY', text: 'Nasi lemak, roti canai,\nlaksa, and satay.' },
    { label: 'STAY CURIOUS', text: 'Ask about ingredients,\nregional styles, and traditions.' }
  ], note: 'ONE DISH CAN HAVE MANY LOCAL VERSIONS' },
  { chapter: 'Terima kasih', seconds: 12, layout: 'closing', title: 'Arrive curious.\nLeave with stories.', body: 'Discover the city. Listen to the people.\nMake space for the unexpected.', note: 'TERIMA KASIH / THANK YOU' }
];

export const HTML_STORY: StoryScene[] = [
  { chapter: 'What HTML does', seconds: 8, layout: 'hero', title: 'Your first\nHTML page.', body: 'HTML gives content structure and meaning.\nStart with a small page you can understand.', note: 'HTML BASICS / NO FRAMEWORK REQUIRED' },
  { chapter: 'The document skeleton', seconds: 12, layout: 'code', title: 'Start with\na document.', body: 'The head holds metadata.\nThe body holds the content\npeople read and use.', code: '<!doctype html>\n<html lang="en">\n  <head>\n    <meta charset="utf-8">\n    <title>My first page</title>\n  </head>\n  <body>\n    <h1>Hello, Malaysia!</h1>\n  </body>\n</html>', note: 'SAVE AS index.html / OPEN IN A BROWSER' },
  { chapter: 'Elements and attributes', seconds: 10, layout: 'code', title: 'An element\nhas a job.', body: 'Most elements wrap content\nbetween opening and closing tags.\nAttributes add extra information.', code: '<p>A short introduction.</p>\n\n<a href="about.html">\n  About this page\n</a>\n\n<!-- href is an attribute. -->', note: 'ELEMENT = TAGS + CONTENT / ATTRIBUTE = EXTRA DETAIL' },
  { chapter: 'Headings and paragraphs', seconds: 10, layout: 'code', title: 'Give your words\na clear order.', body: 'Use headings for structure,\nnot just for larger text.\nParagraphs carry the story.', code: '<h1>A taste of Malaysia</h1>\n<p>Welcome to my food journal.</p>\n\n<h2>Breakfast favourites</h2>\n<p>Start with nasi lemak.</p>\n\n<h2>What to try next</h2>\n<p>Explore a regional laksa.</p>', note: 'A CLEAR MAIN HEADING / LOGICAL SUBHEADINGS' },
  { chapter: 'Links and images', seconds: 12, layout: 'code', title: 'Connect ideas.\nDescribe images.', body: 'Use meaningful link text.\nGive informative images alt text\nthat explains their purpose.', code: '<a href="menu.html">View the menu</a>\n\n<img\n  src="nasi-lemak.jpg"\n  alt="Nasi lemak with sambal and egg"\n>\n\n<!-- Decorative image? Use alt="". -->', note: 'CODE EXAMPLE / IMAGE FILES ARE HOST-SUPPLIED' },
  { chapter: 'Lists that make sense', seconds: 10, layout: 'code', title: 'Some content\nbelongs in a list.', body: 'Use ul when order does not matter.\nUse ol when the sequence\nis part of the meaning.', code: '<ul>\n  <li>Rice</li>\n  <li>Coconut milk</li>\n</ul>\n\n<ol>\n  <li>Prepare the ingredients.</li>\n  <li>Cook and serve.</li>\n</ol>', note: 'ul = UNORDERED / ol = ORDERED / li = LIST ITEM' },
  { chapter: 'Semantic page structure', seconds: 12, layout: 'code', title: 'Choose meaning\nover mystery.', body: 'Semantic elements describe\nthe purpose of each region.\nThey make structure clearer.', code: '<header>\n  <nav aria-label="Main">...</nav>\n</header>\n<main>\n  <article>\n    <h1>My food journal</h1>\n    <p>Today\'s story...</p>\n  </article>\n</main>\n<footer>About this journal</footer>', note: 'header / nav / main / article / footer' },
  { chapter: 'Accessible controls', seconds: 10, layout: 'code', title: 'Make controls\neasy to use.', body: 'Label inputs explicitly.\nUse a button for an action\nand a link for navigation.', code: '<label for="dish">Favourite dish</label>\n<input id="dish" name="dish" type="text">\n\n<button type="button">Save draft</button>\n\n<!-- HTML creates the control. -->\n<!-- JavaScript adds the save action. -->', note: 'DO NOT RELY ON PLACEHOLDER TEXT AS A LABEL' },
  { chapter: 'HTML, CSS, JavaScript', seconds: 10, layout: 'cards', title: 'Three tools. Different responsibilities.', body: 'Start with meaningful HTML, then build on it.', items: [
    { number: '01', label: 'HTML', text: 'Structure and meaning.\nWhat is this content?' },
    { number: '02', label: 'CSS', text: 'Presentation and layout.\nHow should it look?' },
    { number: '03', label: 'JavaScript', text: 'Behaviour and interaction.\nWhat happens when I act?' }
  ] },
  { chapter: 'Your first-page checklist', seconds: 14, layout: 'closing', title: 'Small page.\nStrong foundations.', body: 'Add a title and a main heading.\nWrite a paragraph. Link to another page.\nCheck structure, labels, and image descriptions.', note: 'WRITE / OPEN / READ / REFINE' }
];

export const FOOD_STORY: StoryScene[] = [
  { chapter: 'Welcome to the table', seconds: 8, layout: 'hero', title: 'A taste of\nMalaysia.', body: 'Familiar favourites. Regional character.\nA food story made for sharing.', note: 'THE FOOD EDIT / MALAYSIAN FAVOURITES' },
  { chapter: 'Nasi lemak', seconds: 12, layout: 'split', title: 'Nasi lemak.\nA breakfast icon.', body: 'Coconut rice meets sambal,\nwith accompaniments that vary\nfrom stall to stall.', items: [
    { label: 'THE FOUNDATION', text: 'Fragrant rice cooked\nwith coconut milk.' },
    { label: 'THE COMPANY', text: 'Often cucumber, egg, peanuts,\nand crispy anchovies.' }
  ], note: 'SAMBAL BRINGS HEAT / ASK HOW SPICY' },
  { chapter: 'Roti canai', seconds: 10, layout: 'split', title: 'Roti canai.\nLayers worth sharing.', body: 'A flaky flatbread, commonly\nserved with dhal or curry.\nTear, dip, and enjoy.', items: [
    { label: 'TEXTURE', text: 'Crisp edges meet\nsoft, folded layers.' },
    { label: 'AT THE TABLE', text: 'A familiar choice\nat Malaysian mamak eateries.' }
  ], note: 'A SIMPLE ORDER / MANY LOCAL VARIATIONS' },
  { chapter: 'Laksa', seconds: 12, layout: 'cards', title: 'One name. Different bowls.', body: 'Laksa changes with the region, the broth, and the cook.', items: [
    { number: '01', label: 'Asam laksa', text: 'A tangy, fish-based broth\nassociated with Penang.' },
    { number: '02', label: 'Curry laksa', text: 'A richer style with\na spiced coconut broth.' },
    { number: '03', label: 'Sarawak laksa', text: 'A distinctive spiced broth\nserved with rice vermicelli.' }
  ], note: 'REGIONAL RECIPES AND TOPPINGS VARY' },
  { chapter: 'Satay', seconds: 10, layout: 'split', title: 'Satay.\nMade for the table.', body: 'Marinated skewers grilled\nover heat and often served\nwith peanut sauce.', items: [
    { label: 'THE PLATE', text: 'Common accompaniments include\ncucumber, onion, and rice cakes.' },
    { label: 'BEFORE YOU ORDER', text: 'Ask about the meat,\nmarinade, and peanut sauce.' }
  ], note: 'PEANUT SAUCE IS NOT SUITABLE FOR EVERYONE' },
  { chapter: 'Something sweet', seconds: 10, layout: 'cards', title: 'Leave room for a sweet finish.', body: 'Cold treats and small bites have a place in the story too.', items: [
    { number: '01', label: 'Cendol', text: 'Green jelly strands, coconut\nmilk, palm sugar, and ice.' },
    { number: '02', label: 'Ais kacang', text: 'Shaved ice with colourful\ntoppings and sweet syrups.' },
    { number: '03', label: 'Kuih', text: 'A wide family of small snacks\nin many shapes and flavours.' }
  ] },
  { chapter: 'Order with confidence', seconds: 10, layout: 'cards', title: 'Good questions make a better meal.', body: 'Recipes differ. Do not assume a dish suits every diet.', items: [
    { number: '01', label: 'Ingredients', text: 'Ask about peanuts, shellfish,\negg, dairy, and other allergens.' },
    { number: '02', label: 'Preferences', text: 'Check spice levels, meat choices,\nand dietary requirements.' },
    { number: '03', label: 'Preparation', text: 'For allergies, ask about shared\nequipment and cross-contact.' }
  ] },
  { chapter: 'Selamat menjamu selera', seconds: 8, layout: 'closing', title: 'Different flavours.\nOne shared table.', body: 'Try something familiar. Discover something new.\nKeep the conversation going.', note: 'SELAMAT MENJAMU SELERA / ENJOY YOUR MEAL' }
];
