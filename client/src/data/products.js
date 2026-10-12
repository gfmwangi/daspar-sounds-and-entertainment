// Product records transcribed from the client-supplied working catalogue.
// The client has since confirmed that every product currently listed on the site is available.
// Prices are inquiry-based. Do not infer technical details absent or unclear in the source.
export const PRODUCT_CATEGORIES = [
  { id: "mixers", label: "Audio Mixers & Powered Mixers", group: "Audio" },
  { id: "speakers", label: "Speakers & Sound Systems", group: "Audio" },
  { id: "microphones", label: "Microphones & Wireless Microphone Systems", group: "Audio" },
  { id: "instruments", label: "Musical Instruments", group: "Audio" },
  { id: "accessories", label: "Audio Connectors & Accessories", group: "Accessories" },
  { id: "amplifiers", label: "Amplifiers & Power Equipment", group: "Audio" },
  { id: "electrical", label: "Electrical Accessories & Protection", group: "Electronics" },
  { id: "cases", label: "Equipment Cases", group: "Accessories" },
  { id: "displays", label: "TVs & Displays", group: "Electronics" },
  { id: "pumps", label: "Water Pumps", group: "Electronics" },
];

const categoryById = new Map(PRODUCT_CATEGORIES.map((category) => [category.id, category]));

function product(id, name, categoryId, description, specifications, images) {
  const category = categoryById.get(categoryId);
  return {
    id,
    name,
    categoryId,
    categoryLabel: category.label,
    group: category.group,
    description,
    specifications,
    images,
    availability: "in_stock",
  };
}

export const PRODUCTS = [
  product("pro-mixers", "Pro-Mixers", "mixers",
    "Pro mixers available in 8-channel, 12-channel and 16-channel options.",
    [{ label: "Channels", value: "8, 12 and 16" }],
    ["PROMIXER1.jpeg", "PROMIXER2.jpeg", "PRO MIXER.jpeg"]),
  product("pro-mixer-12", "Pro-Mixer", "mixers",
    "Pro-mixers 12 channels mixing console.",
    [{ label: "Catalogue specification", value: "Pro-mixer 12" }],
    ["PROMIXER12.jpeg"]),
  product("omax-4-channel-powered-mixer", "OMAX 4 Channel Powered Mixer", "mixers",
    "", [], ["OMAX 4 CHANNEL POWERED SPEAKER.jpeg"]),
  product("omax-8-channel-powered-mixer", "OMAX 8-Channel Powered Mixer", "mixers",
    "", [], ["omax 8 channel powered mixer.jpeg"]),

  product("ceiling-speakers", "Ceiling Speakers", "speakers",
    "Ceiling speakers.", [], ["CEILING SPEAKERS.jpeg"]),
  product("full-range-speaker", "Full Range Speaker", "speakers",
    "JBL SRX 725 full range speaker.",
    [{ label: "Catalogue detail", value: "JBL SRX 725" }], ["FULL RANGE SPEAKER.jpeg"]),
  product("mid-range-speaker", "Mid Range Speaker", "speakers",
    "JBL SRX midrange speaker.",
    [{ label: "Catalogue detail", value: "JBL SRX midrange speaker" }], ["MID RANGE SPEAKER.jpeg"]),
  product("speaker-driver-bare-speaker", "Speaker Driver / Bare Speaker", "speakers",
    "Naked speaker.", [{ label: "Catalogue detail", value: "Naked speaker" }],
    ["naked base speakers.jpeg", "naked base speaker b.jpeg"]),
  product("nexo-speakers", "Nexo Speakers", "speakers",
    "Nexo speakers.", [], ["NEXO SPEAKERS.jpeg"]),

  product("bnk-902-wireless-microphone", "BNK 902 Wireless Microphone", "microphones",
    "BNK 902 dual wireless microphone.",
    [{ label: "Catalogue detail", value: "Dual wireless microphone" }], ["BNK 902 WIRELESS MICROPHONE.jpeg"]),
  product("bnk-8400-wireless-microphones", "BNK 8400 Wireless Microphones", "microphones",
    "BNK 8400 wireless microphones.", [], ["BNK 8400 WIRELESS MICROPHONES.jpeg"]),
  product("bnk-coded-microphones", "BNK Coded Microphones", "microphones",
    "BNK coded microphones.", [], ["BNK CODED MICROPHONES.jpeg", "BNK CODED MICROPHONES b.jpeg"]),
  product("sennheiser-coded-microphone", "Sennheiser Coded Microphone", "microphones",
    "Sennheiser coded microphone.", [], ["SENNHEISER CODED MICROPHONE.jpeg"]),
  product("sennheiser-skm-9000", "Sennheiser SKM 9000 Wireless Microphone", "microphones",
    "Sennheiser SKM 9000 wireless microphone.", [],
    ["SENNHEISER SKM 9000 WIRELESS MICROPHONE.jpeg", "SENNHEISER SKM 9000 WIRELESSMICROPHONE b.jpeg"]),
  product("x35-dual-wireless-microphone", "X35 Dual Wireless Microphone", "microphones",
    "X35 dual wireless microphone.", [], ["X35 DUAL WIRELESS MICROPHONE.jpeg"]),
  product("skm-9200-wireless-microphone", "SKM 9200 Wireless Microphone", "microphones",
    "SKM 9200 wireless microphone.", [], ["SKM 9200 WIRELESS SPEAKERS.jpeg"]),

  product("5pcs-drumsets", "5PCS Drumsets", "instruments",
    "5 PCS drumsets.", [{ label: "Catalogue detail", value: "5 PCS drumsets" }], ["5PCS-7PCS DRUMSETS.jpeg"]),
  product("7pcs-drumsets", "7PCS Drumsets", "instruments",
    "7 PCS drumsets.", [{ label: "Catalogue detail", value: "7 PCS drumsets" }], ["DRUMSETS.jpeg"]),
  product("electric-acoustic-guitars", "Electric/Acoustic Guitars", "instruments",
    "Electric/acoustic guitars.", [], ["ELECTRIC-ACOUSTIC GUITARS.jpeg"]),
  product("yamaha-keyboards", "Yamaha Keyboards", "instruments",
    "Yamaha keyboards.", [], ["yamaha keyboards.jpeg"]),

  product("8mm-mono-jackpins", "8MM Mono Jackpins", "accessories",
    "8MM Mono Jackpins.", [], ["8MM MONO JACKPINS.jpeg"]),

  product("power-amplifiers", "Power Amplifiers", "amplifiers",
    "Power amplifiers.", [], ["POWER AMPLIFIERS a.jpeg", "POWER AMPLIFIERS b.jpeg"]),
  product("power-generators", "Power Generators", "amplifiers",
    "Power generators.", [], ["POWER GENERATORS.jpeg"]),

  product("extension-cord-1-5mm-2-5mm", "1.5MM–2.5 Extension Cord", "electrical",
    "1.5MM–2.5 Extension Cord.", [], ["1.5MM-2.5 EXTENSION CORD.jpeg"]),
  product("extension-cord-50-100-metres", "50/100 Metres Extension Cord", "electrical",
    "50/100 metres extension cord.",
    [{ label: "Lengths listed", value: "50/100 metres" }], ["50-100EXTENSION CORD.jpeg"]),
  product("automatic-voltage-regulator", "Automatic Voltage Regulator", "electrical",
    "Automatic voltage regulator.", [], ["AUTOMATIC VAULT RAGE REGULATOR.jpeg"]),
  product("fridge-tv-guard", "Fridge/TV Guard", "electrical",
    "Fridge/TV guard.", [], ["FRIDGE-TV GUARD.jpeg"]),

  product("12u-16u-flight-case", "12U/16U Flight Case", "cases",
    "12U/16U flight case.", [{ label: "Sizes listed", value: "12U/16U" }],
    ["12U-16U FLIGHT CASE.jpeg", "12U-16U FLIGHT CASE b.jpeg"]),

  // The client confirmed the Android/Smart TV description and size/brand details.
  product("android-smart-tv", "Android Smart TV", "displays",
    'Android/smart TVs in 43" and 55" VITRON sizes.',
    [{ label: "Size and brand", value: '43", 55" VITRON' }],
    ["ANDROID-SMART TV.jpeg", "ANDROID-SMART TV b.jpeg"]),

  product("electric-solar-water-pumps", "Electric/Solar Water Pumps", "pumps",
    "Electric/solar water pumps.", [], ["ELECTRIC-SOLAR WATER PUMPS.jpeg"]),
];

export const getProductById = (id) => PRODUCTS.find((item) => item.id === id);
