// Teamup Webhook Handler
// For Express.js on Vercel, Netlify, etc.

const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');
const app = express();

// Safely get environment variables
const getEnv = (key, defaultValue = '') => {
  try {
    return process.env[key] || defaultValue;
  } catch (error) {
    console.error(`Error accessing environment variable ${key}:`, error);
    return defaultValue;
  }
};

// Configurable logging
const ENABLE_LOGGING = getEnv('ENABLE_LOGGING') === 'true'; // Disabled by default
const LOG_LEVEL = getEnv('LOG_LEVEL', 'info'); // Default to 'info'

// Simple logging utility with error handling
const logger = {
  levels: {
    error: 0,
    warn: 1,
    info: 2,
    debug: 3,
    trace: 4
  },
  
  shouldLog(level) {
    try {
      if (!ENABLE_LOGGING) return false;
      return this.levels[level] <= this.levels[LOG_LEVEL];
    } catch (error) {
      // Fail silently and return false if there's an error
      return false;
    }
  },
  
  error(...args) {
    try {
      if (this.shouldLog('error')) console.error('❌', ...args);
    } catch (error) {
      // If logger fails, try direct console
      console.error('Logger error:', error);
    }
  },
  
  warn(...args) {
    try {
      if (this.shouldLog('warn')) console.warn('⚠️', ...args);
    } catch (error) {
      // Silent fail
    }
  },
  
  info(...args) {
    try {
      if (this.shouldLog('info')) console.log('ℹ️', ...args);
    } catch (error) {
      // Silent fail
    }
  },
  
  debug(...args) {
    try {
      if (this.shouldLog('debug')) console.log('🔍', ...args);
    } catch (error) {
      // Silent fail
    }
  },
  
  trace(...args) {
    try {
      if (this.shouldLog('trace')) console.log('📋', ...args);
    } catch (error) {
      // Silent fail
    }
  }
};

// Your Teamup API key
const TEAMUP_API_KEY = getEnv('TEAMUP_API_KEY');
// Your calendar ID
const CALENDAR_ID = getEnv('CALENDAR_ID');

// Map of sub-calendar IDs to specific Zoom links
const SUB_CALENDAR_ZOOM_LINKS = {
  '12345': 'Zoom Link for Team A: https://zoom.us/j/123456789',
  '67890': 'Zoom Link for Team B: https://zoom.us/j/987654321',
  // Add more sub-calendars and their respective Zoom links
};

// Middleware to parse JSON request body with error handling
app.use((req, res, next) => {
  bodyParser.json({
    // Increase limit if needed
    limit: '1mb',
    // Add error handling
    verify: (req, res, buf) => {
      try {
        JSON.parse(buf);
      } catch (e) {
        res.status(400).send('Invalid JSON');
        throw new Error('Invalid JSON');
      }
    }
  })(req, res, next);
});

// Health check endpoint
app.get('/', (req, res) => {
  res.status(200).send('Webhook handler is running');
});

// Health check endpoint
app.get('/webhook', (req, res) => {
  res.status(200).send('Webhook endpoint is ready to receive events');
});

// Endpoint to receive Teamup webhooks
app.post('/webhook', (req, res) => {
  // Always log webhook receipt regardless of ENABLE_LOGGING setting
  console.log('🔔 Webhook received at:', new Date().toISOString());
  
  // Wrap everything in try/catch to prevent crashes
  try {
    const eventData = req.body || {};
    
    // Always log basic info about the webhook
    console.log(`Action: ${eventData.action || 'undefined'}, Event ID: ${eventData.event?.id || 'undefined'}`);
    
    // Check if event data exists
    if (!eventData || !eventData.event) {
      console.log('⚠️ No valid event data found in webhook payload');
      res.status(200).send('Webhook received, but no valid event data found');
      return;
    }
    
    // Check if this is an event creation or update
    if (eventData.action === 'event.create' || eventData.action === 'event.update') {
      console.log('✓ Event action matches criteria (create/update)');
      
      const eventId = eventData.event.id;
      const subCalendarId = eventData.event.subcalendar_id;
      
      console.log(`Event ID: ${eventId}, Sub-calendar ID: ${subCalendarId}`);
      
      // Check if subcalendar_id exists
      if (!subCalendarId) {
        console.log('⚠️ No subcalendar_id found in event');
        res.status(200).send('Webhook received, but no subcalendar_id found');
        return;
      }
      
      // Get the appropriate Zoom link for this sub-calendar
      const zoomLink = SUB_CALENDAR_ZOOM_LINKS[subCalendarId];
      
      // Check if we have a Zoom link for this sub-calendar
      if (zoomLink) {
        console.log(`Found Zoom link for sub-calendar ${subCalendarId}: ${zoomLink}`);
        
        // Update the event with the Zoom link
        updateEventZoomLink(eventId, zoomLink)
          .then(updateResult => {
            if (updateResult) {
              console.log(`✅ Successfully updated event ${eventId} with Zoom link`);
            } else {
              console.log(`❌ Failed to update event ${eventId} with Zoom link`);
            }
          })
          .catch(error => {
            console.error('Error in update promise:', error);
          });
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
    } else {
      console.log(`⚠️ Event action ${eventData.action} does not match criteria (create/update)`);
    }
    
    // Always return success to acknowledge receipt
    res.status(200).send('Webhook received');
  } catch (error) {
    console.error('❌ Error processing webhook:', error.message || error);
    
    // Still return 200 to acknowledge receipt
    res.status(200).send('Webhook received with errors');
  }
});

// Function to update the Zoom link for an event
async function updateEventZoomLink(eventId, zoomLink) {
  try {
    console.log(`Attempting to update event ${eventId} with Zoom link...`);
    
    // Check required environment variables
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
    
    // Make the API request to update the event
    try {
      const response = await axios.put(url, updateData, {
        headers: {
          'Content-Type': 'application/json',
          'Teamup-Token': TEAMUP_API_KEY
        }
      });
      
      console.log(`API response status: ${response.status}`);
      return true;
    } catch (axiosError) {
      console.error('❌ API request failed:', axiosError.message);
      console.error('Response status:', axiosError.response?.status || 'Unknown');
      console.error('Response data:', JSON.stringify(axiosError.response?.data || {}));
      return false;
    }
  } catch (error) {
    console.error('❌ Error in updateEventZoomLink function:', error.message || error);
    return false;
  }
}

// For local testing
if (require.main === module) {
  try {
    const PORT = getEnv('PORT', '3000');
    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
  }
}

// For serverless deployment - ensure we always export something
try {
  module.exports = app;
} catch (error) {
  console.error('Error in module export:', error);
  // Provide a fallback minimal app if the main one fails
  const fallbackApp = express();
  fallbackApp.get('*', (req, res) => {
    res.status(200).send('Webhook handler in recovery mode');
  });
  module.exports = fallbackApp;
}