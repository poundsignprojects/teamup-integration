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
  // Add your actual subcalendar ID from the logs (14156325)
  '14156325': 'Zoom Link for Your Team: https://zoom.us/j/123456789',
  
  // Keep these as examples/backups
  '12345': 'Zoom Link for Team A: https://zoom.us/j/123456789',
  '67890': 'Zoom Link for Team B: https://zoom.us/j/987654321',
};

// Configure the name of the custom field to update
const CUSTOM_FIELD_NAME = 'zoom_link2'; // Match the existing field name in your Teamup calendar

// Middleware to parse JSON request body
app.use(bodyParser.json());

// Health check endpoint
app.get('/', (req, res) => {
  res.status(200).send('Webhook handler is running');
});

// Health check endpoint
app.get('/webhook', (req, res) => {
  res.status(200).send('Webhook endpoint is ready to receive events');
});

// Endpoint to receive Teamup webhooks
app.post('/webhook', async (req, res) => {
  // Always log webhook receipt
  console.log('🔔 Webhook received at:', new Date().toISOString());
  
  try {
    const webhookData = req.body;
    
    // Log the payload summary
    console.log(`Webhook ID: ${webhookData.id || 'undefined'}, Calendar: ${webhookData.calendar || 'undefined'}`);
    
    // Check if dispatch array exists
    if (!webhookData.dispatch || !Array.isArray(webhookData.dispatch) || webhookData.dispatch.length === 0) {
      console.log('⚠️ No dispatch array found in webhook payload');
      res.status(200).send('Webhook received, but no dispatch array found');
      return;
    }
    
    // Process each dispatch item (usually just one)
    for (const dispatchItem of webhookData.dispatch) {
      const trigger = dispatchItem.trigger;
      const eventData = dispatchItem.event;
      
      console.log(`Trigger: ${trigger || 'undefined'}, Event ID: ${eventData?.id || 'undefined'}`);
      
      // Check if event data exists
      if (!eventData) {
        console.log('⚠️ No event data found in dispatch item');
        continue;
      }
      
      // Check if this is an event creation or modification
      if (trigger === 'event.created' || trigger === 'event.modified') {
        console.log('✓ Event trigger matches criteria (created/modified)');
        
        const eventId = eventData.id;
        const subCalendarId = eventData.subcalendar_id;
        
        console.log(`Event ID: ${eventId}, Sub-calendar ID: ${subCalendarId}`);
        
        // Check if subcalendar_id exists
        if (!subCalendarId) {
          console.log('⚠️ No subcalendar_id found in event');
          continue;
        }
        
        // Convert subcalendar_id to string for consistent comparison
        const subCalendarIdStr = String(subCalendarId);
        
        // Get the appropriate Zoom link for this sub-calendar
        const zoomLink = SUB_CALENDAR_ZOOM_LINKS[subCalendarIdStr];
        
        // Check if we have a Zoom link for this sub-calendar
        if (zoomLink) {
          console.log(`Found Zoom link for sub-calendar ${subCalendarIdStr}: ${zoomLink}`);
          
          try {
            // Update the event with the Zoom link (using await for better error capture)
            const updateResult = await updateEventZoomLink(eventId, zoomLink);
            
            if (updateResult) {
              console.log(`✅ Successfully updated event ${eventId} with Zoom link`);
            } else {
              console.log(`❌ Failed to update event ${eventId} with Zoom link`);
            }
          } catch (error) {
            console.error(`❌ Error updating event ${eventId}:`, error.message);
          }
        } else {
          console.log(`⚠️ No Zoom link configured for sub-calendar ${subCalendarIdStr}`);
          console.log('Available sub-calendar IDs:', Object.keys(SUB_CALENDAR_ZOOM_LINKS).join(', '));
        }
        
        // Log event fields for detailed debugging
        console.log('🔍 Event details:');
        console.log(`  Title: ${eventData.title || 'undefined'}`);
        console.log(`  Start: ${eventData.start_dt || 'undefined'}`);
        console.log(`  Custom fields: ${JSON.stringify(eventData.custom || {})}`);
      } else {
        console.log(`⚠️ Event trigger ${trigger} does not match criteria (created/modified)`);
      }
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
    
    // Log actual values (safely)
    console.log(`Calendar ID: ${CALENDAR_ID}`);
    console.log(`API Key: ${TEAMUP_API_KEY ? (TEAMUP_API_KEY.substring(0, 3) + '...') : 'not set'}`);
    
    const url = `https://api.teamup.com/${CALENDAR_ID}/events/${eventId}`;
    console.log(`API URL: ${url}`);
    
    // Format the Zoom link HTML to match Teamup's format
    const zoomLinkHtml = `<a href="${zoomLink}" target="_blank" rel="noreferrer noopener external">${zoomLink}</a>`;
    
    // Prepare the update data
    const updateData = {
      custom: {}
    };
    updateData.custom[CUSTOM_FIELD_NAME] = {
      html: zoomLinkHtml
    };
    
    console.log('Request payload:', JSON.stringify(updateData));
    
    // Make the API request to update the event
    try {
      const response = await axios({
        method: 'put',
        url: url,
        data: updateData,
        headers: {
          'Content-Type': 'application/json',
          'Teamup-Token': TEAMUP_API_KEY
        }
      });
      
      console.log(`API response status: ${response.status}`);
      console.log(`Response data: ${JSON.stringify(response.data || {}).substring(0, 200)}`);
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

// For serverless deployment
module.exports = app;