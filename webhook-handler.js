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
  '14156325': 'Zoom Link for Team A: https://zoom.us/j/123456789',
  '67890': 'Zoom Link for Team B: https://zoom.us/j/987654321',
  // Add more sub-calendars and their respective Zoom links
};

// Middleware to parse JSON request body
app.use(bodyParser.json());

// Endpoint to receive Teamup webhooks
app.post('/webhook', async (req, res) => {
  try {
    logger.info('Webhook triggered at:', new Date().toISOString());
    
    const eventData = req.body;
    
    // Log the complete webhook payload
    logger.debug('Webhook payload:');
    if (logger.shouldLog('debug')) {
      console.log(JSON.stringify(eventData, null, 2));
    }
    
    // Check if this is an event creation or update
    if (eventData.action === 'event.create' || eventData.action === 'event.update') {
      const eventId = eventData.event.id;
      const subCalendarId = eventData.event.subcalendar_id;
      
      // Get the appropriate Zoom link for this sub-calendar
      const zoomLink = SUB_CALENDAR_ZOOM_LINKS[subCalendarId];
      
      if (zoomLink) {
        // Update the event with the Zoom link
        await updateEventZoomLink(eventId, zoomLink);
        logger.info(`Updated event ${eventId} with Zoom link for sub-calendar ${subCalendarId}`);
      } else {
        logger.warn(`No Zoom link configured for sub-calendar ${subCalendarId}`);
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
    const url = `https://api.teamup.com/${CALENDAR_ID}/events/${eventId}`;
    
    // Prepare the update data
    // Note: Update this structure based on how your custom fields are configured
    const updateData = {
      custom: {
        'zoom_link2': zoomLink
      }
    };
    
    logger.debug(`Making API request to ${url}`);
    
    // Make the API request to update the event
    await axios.put(url, updateData, {
      headers: {
        'Content-Type': 'application/json',
        'Teamup-Token': TEAMUP_API_KEY
      }
    });
    
    logger.debug(`Successfully updated event ${eventId}`);
    return true;
  } catch (error) {
    logger.error('Error updating event:', error);
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