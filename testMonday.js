require('dotenv').config();
const axios = require('axios');

async function testMonday() {
    try {
        console.log('--- Testing Monday API connection with "me" query ---');

        // 1) Check if token is valid by querying your user info
        let query = `
      query {
        me {
          id
          name
        }
      }
    `;

        let response = await axios.post(
            'https://api.monday.com/v2',
            { query },
            { headers: { Authorization: process.env.MONDAY_API_TOKEN } }
        );

        console.log('Response from "me":', JSON.stringify(response.data, null, 2));

        // 2) List up to 10 boards
        console.log('--- Listing up to 1000 boards ---');
        query = `
      query {
        boards(limit: 1000) {
          id
          name
        }
      }
    `;

        response = await axios.post(
            'https://api.monday.com/v2',
            { query },
            { headers: { Authorization: process.env.MONDAY_API_TOKEN } }
        );

        console.log('Boards response:', JSON.stringify(response.data, null, 2));

        console.log('--- Test complete ---');

    } catch (error) {
        console.error('Error connecting to Monday.com:', error);
    }
}

testMonday();
