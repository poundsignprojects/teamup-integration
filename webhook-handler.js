// Teamup Webhook Handler
// For Express.js on Vercel, Netlify, etc.

const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');
const app = express();

// Your Teamup API key
const TEAMUP_API_KEY = process.env.TEAMUP_API_KEY;
// Your calendar ID
const CALENDAR_ID = process.env.CALENDAR_ID;

// Map of sub-calendar IDs to specific Zoom links
const SUB_CALENDAR_ZOOM_LINKS = {
  '12345': 'Zoom Link for Team A: https://zoom.us/j/123456789',
  '67890': 'Zoom Link for Team B: https://zoom.us/j/987654321',
  // Add more sub-calendars and their respective Zoom links
};

// Middleware to parse JSON request body
app.use(bodyParser.json());

// Endpoint to receive Teamup webhooks
app.post('/webhook', async (req, res) => {
  try {
    const eventData = req.body;
    
    // Check if this is an event creation or update
    if (eventData.action === 'event.create' || eventData.action === 'event.update') {
      const eventId = eventData.event.id;
      const subCalendarId = eventData.event.subcalendar_id;
      
      // Get the appropriate Zoom link for this sub-calendar
      const zoomLink = SUB_CALENDAR_ZOOM_LINKS[subCalendarId];
      
      if (zoomLink) {
        // Update the event with the Zoom link
        await updateEventZoomLink(eventId, zoomLink);
        console.log(`Updated event ${eventId} with Zoom link for sub-calendar ${subCalendarId}`);
      } else {
        console.log(`No Zoom link configured for sub-calendar ${subCalendarId}`);
      }
    }
    
    // Always return a 200 response to Teamup quickly
    res.status(200).send('Webhook received');
  } catch (error) {
    console.error('Error processing webhook:', error);
    // Still return 200 to acknowledge receipt
    res.status(200).send('Webhook received with errors');
  }
});

// Function to update the Zoom link for an event
async function updateEventZoomLink(eventId, zoomLink) {
  try {
    const url = `https://api.teamup.com/${CALENDAR_ID}/events/${eventId}`;
    
    // Prepare the update data
    // Note: Update this structure based on how your custom fields are configured
    const updateData = {
      custom: {
        'zoom link': zoomLink
      }
    };
    
    // Make the API request to update the event
    await axios.put(url, updateData, {
      headers: {
        'Content-Type': 'application/json',
        'Teamup-Token': TEAMUP_API_KEY
      }
    });
    
    return true;
  } catch (error) {
    console.error('Error updating event:', error);
    return false;
  }
}

// For local testing
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}

// For serverless deployment
module.exports = app;
