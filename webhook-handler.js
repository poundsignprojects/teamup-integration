// Teamup Webhook Handler
// For Express.js on Vercel, Netlify, etc.

const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');
const app = express();

// Configurable logging
const ENABLE_LOGGING = process.env.ENABLE_LOGGING === 'true'; // Disabled by default unless explicitly set to 'true'
const LOG_LEVEL = process.env.LOG_LEVEL || 'info'; // Default to 'info' if not specified

// Simple logging utility
const logger = {
  levels: {
    error: 0,
    warn: 1,
    info: 2,
    debug: 3,
    trace: 4
  },
  
  shouldLog(level) {
    if (!ENABLE_LOGGING) return false;
    return this.levels[level] <= this.levels[LOG_LEVEL];
  },
  
  error(...args) {
    if (this.shouldLog('error')) console.error('❌', ...args);
  },
  
  warn(...args) {
    if (this.shouldLog('warn')) console.warn('⚠️', ...args);
  },
  
  info(...args) {
    if (this.shouldLog('info')) console.log('ℹ️', ...args);
  },
  
  debug(...args) {
    if (this.shouldLog('debug')) console.log('🔍', ...args);
  },
  
  trace(...args) {
    if (this.shouldLog('trace')) console.log('📋', ...args);
  }
};

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
  // Always log webhook receipt regardless of ENABLE_LOGGING setting
  console.log('🔔 Webhook received at:', new Date().toISOString());
  
  try {
    const eventData = req.body;
    
    // Always log basic info about the webhook
    console.log(`Action: ${eventData.action || 'undefined'}, Event ID: ${eventData.event?.id || 'undefined'}`);
    
    // Log the complete webhook payload if debugging is enabled
    logger.debug('Webhook payload:');
    if (logger.shouldLog('debug')) {
      console.log(JSON.stringify(eventData, null, 2));
    }
    
    // Check if this is an event creation or update
    if (eventData.action === 'event.create' || eventData.action === 'event.update') {
      console.log('✓ Event action matches criteria (create/update)');
      
      if (!eventData.event) {
        console.log('⚠️ No event object found in webhook payload');
        res.status(200).send('Webhook received, but no event object found');
        return;
      }
      
      const eventId = eventData.event.id;
      const subCalendarId = eventData.event.subcalendar_id;
      
      console.log(`Event ID: ${eventId}, Sub-calendar ID: ${subCalendarId}`);
      
      // Check if subcalendar_id exists
      if (!subCalendarId) {
        console.log('⚠️ No subcalendar_id found in event');
        res.status(200).send('Webhook received, but no subcalendar_id found');
        return;
      }
      const eventId = eventData.event.id;
      const subCalendarId = eventData.event.subcalendar_id;
      
      // Get the appropriate Zoom link for this sub-calendar
      const zoomLink = SUB_CALENDAR_ZOOM_LINKS[subCalendarId];
      
      // Check if we have a Zoom link for this sub-calendar
      if (zoomLink) {
        console.log(`Found Zoom link for sub-calendar ${subCalendarId}: ${zoomLink}`);
        
        // Update the event with the Zoom link
        const updateResult = await updateEventZoomLink(eventId, zoomLink);
        
        if (updateResult) {
          console.log(`✅ Successfully updated event ${eventId} with Zoom link`);
        } else {
          console.log(`❌ Failed to update event ${eventId} with Zoom link`);
        }
      } else {
        console.log(`⚠️ No Zoom link configured for sub-calendar ${subCalendarId}`);
        console.log('Available sub-calendar IDs:', Object.keys(SUB_CALENDAR_ZOOM_LINKS).join(', '));
      }
      
      // Log event fields for detailed debugging
      logger.debug('Event details:');
      if (logger.shouldLog('debug')) {
        for (const [key, value] of Object.entries(eventData.event)) {
          console.log(`  ${key}: ${JSON.stringify(value)}`);
        }
      }
    }
    
    // Always return a 200 response to Teamup quickly
    res.status(200).send('Webhook received');
  } catch (error) {
    logger.error('Error processing webhook:', error);
    logger.error('Error details:', {
      message: error.message,
      stack: error.stack,
      requestBody: req.body
    });
    // Still return 200 to acknowledge receipt
    res.status(200).send('Webhook received with errors');
  }
});

// Function to update the Zoom link for an event
async function updateEventZoomLink(eventId, zoomLink) {
  try {
    console.log(`Attempting to update event ${eventId} with Zoom link...`);
    
    if (!CALENDAR_ID) {
      console.error('❌ CALENDAR_ID environment variable is not set');
      return false;
    }
    
    if (!TEAMUP_API_KEY) {
      console.error('❌ TEAMUP_API_KEY environment variable is not set');
      return false;
    }
    
    const url = `https://api.teamup.com/${CALENDAR_ID}/events/${eventId}`;
    console.log(`API URL: ${url}`);
    
    // Prepare the update data
    // Note: Update this structure based on how your custom fields are configured
    const updateData = {
      custom: {
        'zoom link': zoomLink
      }
    };
    
    console.log('Request payload:', JSON.stringify(updateData));
    console.log('Using API key:', TEAMUP_API_KEY ? TEAMUP_API_KEY.substring(0, 3) + '...' : 'undefined');
    
    // Make the API request to update the event
    const response = await axios.put(url, updateData, {
      headers: {
        'Content-Type': 'application/json',
        'Teamup-Token': TEAMUP_API_KEY
      }
    });
    
    console.log(`API response status: ${response.status}`);
    console.log(`Response data:`, JSON.stringify(response.data).substring(0, 100) + '...');
    
    return true;
  } catch (error) {
    console.error('❌ Error updating event:', error.message);
    console.error('Error response:', error.response?.data || 'No response data');
    console.error('Error status:', error.response?.status || 'No status code');
    return false;
  }
}

// For local testing
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    logger.info(`Server running on port ${PORT}`);
    logger.info(`Logging enabled: ${ENABLE_LOGGING}, level: ${LOG_LEVEL}`);
  });
}

// For serverless deployment
module.exports = app;