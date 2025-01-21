require('dotenv').config();
const { Client, GatewayIntentBits, Partials } = require('discord.js');
const axios = require('axios');

// 1) Map of language code -> board ID
const boardMap = {
    ES: 169441688,
    IT: 166197610,
    EN: 391082834,
    FR: 307948771,
    DE: 307949567,
    PT: 168436762,
    PL: 256668264,
    NL: 485360488,
    RU: 2698281907,
    LT: 2698281907,
    FI: 2698281907,
    SE: 2698281907,
    CZ: 2698281907,
    SK: 2698281907,
    GR: 2698281907,
    HU: 2698281907
};

// Create the Discord client
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ],
    partials: [Partials.Channel]
});

// In-memory conversation state
const sessionState = {};

/**
 * Called once Discord logs in successfully
 */
client.once('ready', () => {
    console.log(`Logged in as ${client.user.tag}`);
});

/**
 * Listen for messages
 */
client.on('messageCreate', async (message) => {
    if (message.author.bot) return;

    // 1) Handle "/price domainName"
    if (message.content.startsWith('/price')) {
        const parts = message.content.split(' ');
        if (parts.length < 2) {
            return message.reply('Usage: /price <domainName>');
        }

        const domainName = parts[1].trim();

        // 2) Search all boards for the domain
        const matches = await findDomainAcrossBoards(domainName);
        if (matches.length === 0) {
            return message.channel.send(`Domain "${domainName}" was not found in any board.`);
        }

        // 3) Store session state with matches
        sessionState[message.author.id] = {
            step: 'awaitingLanguageCode',
            domainName,
            matches // Array of matches: { langCode, boardId, publisherCost }
        };

        // 4) Inform the user about the found domains
        if (matches.length === 1) {
            // Only one match found, display details and ask for language code
            const { langCode, publisherCost, boardId } = matches[0];
            return message.channel.send(
                `Found domain: **${domainName}**\n` +
                `Publisher Cost: **${publisherCost} €**\n` +
                `Please enter the language code of the article (e.g., IT, EN, DE, etc.).`
            );
        } else {
            // Multiple matches found, inform the user and ask for language code
            const availableLangs = matches.map(match => match.langCode).join(', ');
            return message.channel.send(
                `Found domain: **${domainName}** in multiple boards.\n` +
                `Please enter the language code of the article from the following options: ${availableLangs}`
            );
        }
    }

    // If user is in mid-conversation
    const session = sessionState[message.author.id];
    if (!session) return;

    switch (session.step) {
        case 'awaitingLanguageCode': {
            // User provides the language code (e.g., "IT", "EN")
            const langCodeInput = message.content.toUpperCase().trim();
            const validLangCodes = session.matches.map(match => match.langCode);

            if (!validLangCodes.includes(langCodeInput)) {
                return message.channel.send(
                    `Invalid language code. Please enter one of the following: ${validLangCodes.join(', ')}`
                );
            }

            // Find the matching board details
            const selectedMatch = session.matches.find(match => match.langCode === langCodeInput);

            // Update session state
            session.langCode = langCodeInput;
            session.publisherCost = selectedMatch.publisherCost;
            session.boardId = selectedMatch.boardId;
            session.step = 'askCopywriting';

            return message.channel.send(
                `Selected Language Code: **${langCodeInput}**\n` +
                `Publisher Cost: **${session.publisherCost} €**\n` +
                `Is copywriting included? (yes/no)`
            );
        }

        case 'askCopywriting': {
            const answer = message.content.toLowerCase().trim();
            if (answer === 'yes') {
                session.copyIncluded = true;
                session.step = 'askWordCount';
                return message.channel.send('How many words is the article? (Please enter a number)');
            } else if (answer === 'no') {
                session.copyIncluded = false;
                const finalPrice = computeFinalPrice(session.publisherCost, session.langCode, 0);
                delete sessionState[message.author.id];
                return message.channel.send(`Final price = **${finalPrice}€**`);
            } else {
                return message.channel.send('Please type "yes" or "no".');
            }
        }

        case 'askWordCount': {
            const words = parseInt(message.content.trim(), 10);
            if (isNaN(words) || words <= 0) {
                return message.channel.send('Please enter a valid number for word count.');
            }
            const finalPrice = computeFinalPrice(session.publisherCost, session.langCode, words);
            delete sessionState[message.author.id];
            return message.channel.send(`Final price = **${finalPrice}€**`);
        }

        default:
            // Unknown step, reset the session
            delete sessionState[message.author.id];
            return;
    }
});

/**
 * Search for the domain across all boards
 * Returns an array of matches: { langCode, boardId, publisherCost }
 */
async function findDomainAcrossBoards(domainName) {
    const matches = [];

    for (const [langCode, boardId] of Object.entries(boardMap)) {
        console.log(`Searching board ID=${boardId} for domain="${domainName}"`);

        const publisherCost = await fetchPublisherCostFromBoard(boardId, domainName);
        if (publisherCost !== null) {
            matches.push({ langCode, boardId, publisherCost });
        }
    }

    return matches;
}

/**
 * Query a single board for the domain using items_page_by_column_values
 * Return the publisher cost if found, or null if not found
 */
async function fetchPublisherCostFromBoard(boardId, domainName) {
    const query = `
        query {
          items_page_by_column_values(
            limit: 50,
            board_id: ${boardId},
            columns: [
              {
                column_id: "name",
                column_values: ["${domainName}"]
              }
            ]
          ) {
            items {
              id
              name
              column_values(ids: ["_"]) {
                text
              }
            }
          }
        }
    `;

    try {
        const response = await axios.post(
            'https://api.monday.com/v2',
            { query },
            {
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: process.env.MONDAY_API_TOKEN,
                    'API-version': '2023-10'
                }
            }
        );

        if (response.data.errors) {
            console.error('Monday returned errors:', response.data.errors);
            return null;
        }

        const itemsPage = response.data?.data?.items_page_by_column_values;
        if (!itemsPage || !itemsPage.items || itemsPage.items.length === 0) {
            return null;
        }

        const item = itemsPage.items[0];
        const costCol = item.column_values.find(cv => cv.text !== undefined);
        const publisherCost = parseFloat(costCol?.text || '0');
        console.log(`Found domain in board ${boardId}: cost=${publisherCost}`);
        return publisherCost;
    } catch (error) {
        console.error(`Error searching board ${boardId}:`, error);
        return null;
    }
}

/**
 * Calculate final price: margin + copy cost
 */
function computeFinalPrice(publisherCost, langCode, words) {
    // 1) Margin
    const margin = getPublisherMargin(langCode, publisherCost);

    // 2) Domain price
    const domainPrice = publisherCost + margin;

    // 3) Copy price if words > 0
    let copyPrice = 0;
    if (words > 0) {
        const copyRate = getCopyRate(langCode);
        copyPrice = copyRate * words;
    }

    return roundToTwoDecimals(domainPrice + copyPrice);
}

/**
 * Map language code -> margin group from your table
 *   - group1: IT, PT, RU
 *   - group2: EN, FR, DE, PL, ES, LT
 *   - group3: NL, FI, SE, CZ, SK, HU, GR
 */
function getPublisherMargin(langCode, cost) {
    const code = langCode.toUpperCase();

    const group1 = ['IT', 'PT', 'RU'];
    const group2 = ['EN', 'FR', 'DE', 'PL', 'ES', 'LT'];
    const group3 = ['NL', 'FI', 'SE', 'CZ', 'SK', 'HU', 'GR'];

    const marginCalc = (c, low, mid, percent) => {
        if (c < 300) return low;
        if (c < 500) return mid;
        return c * percent;
    };

    if (group1.includes(code)) {
        return marginCalc(cost, 87, 107, 0.20);
    } else if (group2.includes(code)) {
        return marginCalc(cost, 97, 117, 0.20);
    } else if (group3.includes(code)) {
        return marginCalc(cost, 107, 127, 0.20);
    } else {
        // fallback
        return 0;
    }
}

/**
 * Map language code -> copy rate from your table
 */
function getCopyRate(langCode) {
    const code = langCode.toUpperCase();
    const rates = {
        IT: 0.04, // Italian
        EN: 0.04,
        FR: 0.04,
        DE: 0.08,
        PT: 0.04,
        PL: 0.04,
        ES: 0.04,
        LT: 0.02,
        NL: 0.08,
        FI: 0.08,
        SE: 0.08,
        CZ: 0.06,
        SK: 0.06,
        HU: 0.06,
        GR: 0.08,
        RU: 0.04
    };
    return rates[code] || 0;
}

function roundToTwoDecimals(num) {
    return Math.round(num * 100) / 100;
}

// Finally, log in
client.login(process.env.DISCORD_BOT_TOKEN);
