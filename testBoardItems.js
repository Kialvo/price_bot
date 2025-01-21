require('dotenv').config();
const axios = require('axios');

async function testBoardItems() {
    try {
        console.log('--- Querying board 166197610 (limit 10 items) ---');

        const query = `
      query {
        boards(ids: 166197610) {
          name
          items (limit: 10) {
            id
            name
            column_values {
              id
              title
              text
            }
          }
        }
      }
    `;

        const response = await axios.post(
            'https://api.monday.com/v2',
            { query },
            {
                headers: {
                    Authorization: process.env.MONDAY_API_TOKEN
                }
            }
        );

        // Print the entire response
        console.log('Raw Board Items Response:', JSON.stringify(response.data, null, 2));

        const boards = response.data.data.boards;
        if (!boards || boards.length === 0) {
            console.log('No boards returned. Double-check the ID and your permissions.');
            return;
        }

        const board = boards[0];
        console.log(`Board Name: ${board.name}`);

        // Show items
        if (!board.items || board.items.length === 0) {
            console.log('No items found on this board (or limit = 0).');
        } else {
            console.log(`Found ${board.items.length} item(s). Printing details:`);
            board.items.forEach((item, idx) => {
                console.log(`\nItem #${idx + 1}:`);
                console.log(`  ID: ${item.id}`);
                console.log(`  Name: ${item.name}`);
                console.log(`  Column Values:`);
                item.column_values.forEach(cv => {
                    console.log(`    - [${cv.id}] "${cv.title}" => ${cv.text}`);
                });
            });
        }

        console.log('--- End of Test ---');
    } catch (error) {
        console.error('Error fetching board items from Monday:', error);
    }
}

testBoardItems();
