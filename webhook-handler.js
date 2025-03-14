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
  '14098383': 'New Coffee Shop: https://zoom.us/j/123456789',
  '14098359': 'Integrity Group AKA Saturday Morning Workshop<br>\n<a href="https://us02web.zoom.us/j/82971629914?pwd=ajZBSkI4bmZjWVZpSXBmenJlMXhUUT09">https://us02web.zoom.us/j/82971629914?pwd=ajZBSkI4bmZjWVZpSXBmenJlMXhUUT09</a><br>\nMeeting ID: 829 7162 9914<br>\nPasscode: xs11Aw<br>\nCall in +13462487799<br>\nPassword: 836591<br>\nHost code: 983273<br>\nOne tap mobile +13462487799,82971629914,#,#,,836591# US (Houston)',
  '14098366': 'DJ Zoom: https://zoom.us/j/123456789',
  '14156325': 'BC Powder: https://zoom.us/j/123456789',
  '14098372': 'Power Lunch: https://zoom.us/j/123456789',
  '14098358': 'SWeT Zoom: https://zoom.us/j/123456789',
  '14132335': 'Soul Train: https://zoom.us/j/123456789',
  '14098400': 'Sober Lounge: https://zoom.us/j/123456789',
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
      
      // Log if this is a recurring event
      const isRecurring = !!eventData.series_id || !!eventData.rrule;
      if (isRecurring) {
        console.log(`📅 Recurring event detected. Series ID: ${eventData.series_id || 'N/A'}, RRULE: ${eventData.rrule || 'N/A'}`);
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
            let updateResult;
            
            if (isRecurring) {
              // For recurring events, we'll use the event data from the webhook
              updateResult = await updateRecurringEventZoomLink(eventData, zoomLink);
            } else {
              // For regular events, use the normal approach
              updateResult = await updateEventZoomLink(eventId, zoomLink);
            }
            
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

// Function to update the Zoom link for a regular event
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
    
    const baseUrl = `https://api.teamup.com/${CALENDAR_ID}`;
    
    // First, get the existing event data
    console.log(`Fetching existing event data from: ${baseUrl}/events/${eventId}`);
    
    try {
      // Get the current event
      const getResponse = await axios({
        method: 'get',
        url: `${baseUrl}/events/${eventId}`,
        headers: {
          'Teamup-Token': TEAMUP_API_KEY
        }
      });
      
      console.log(`Successfully fetched event data. Status: ${getResponse.status}`);
      
      // Get the existing event data and log all fields for debugging
      const eventData = getResponse.data.event; // Extract from the "event" property
      console.log("Retrieved event properties:", Object.keys(eventData).join(', '));
      
      // Handle multiple subcalendars properly
      const currentSubcalendarIds = eventData.subcalendar_ids || [];
      console.log("Current subcalendar IDs:", currentSubcalendarIds);
      
      // Convert our SUB_CALENDAR_ZOOM_LINKS keys to numbers for consistent comparison
      const ourSubcalendarIds = Object.keys(SUB_CALENDAR_ZOOM_LINKS).map(id => Number(id));
      
      // Filter subcalendar IDs:
      // 1. Keep all subcalendars NOT in our list
      // 2. Keep ONE subcalendar from our list (the one that triggered this webhook)
      const managedIds = currentSubcalendarIds.filter(id => ourSubcalendarIds.includes(id));
      const otherIds = currentSubcalendarIds.filter(id => !ourSubcalendarIds.includes(id));
      
      // If we have managed IDs, keep the first one (should be the triggering ID)
      const keepOneId = managedIds.length > 0 ? [managedIds[0]] : [];
      
      // Combine: IDs we're not managing + one ID we are managing
      const finalSubcalendarIds = [...otherIds, ...keepOneId];
      
      console.log("Filtered subcalendar IDs:", finalSubcalendarIds);
      
      // Create a proper copy of the custom fields
      const customFields = copyCustomFields(eventData.custom);
      
      // Update our specific custom field with the HTML-formatted link
      customFields[CUSTOM_FIELD_NAME] = {
        html: zoomLink
      };
      
      // Create the update payload with all required fields
      const updateData = {
        id: eventId,
        start_dt: eventData.start_dt,
        end_dt: eventData.end_dt,
        title: eventData.title || '',
        subcalendar_id: finalSubcalendarIds[0], // Primary subcalendar ID
        subcalendar_ids: finalSubcalendarIds,   // All subcalendar IDs
        custom: customFields
      };
      
      // Also include other important fields if they exist
      if (eventData.who) updateData.who = eventData.who;
      if (eventData.location) updateData.location = eventData.location;
      if (eventData.notes) updateData.notes = eventData.notes;
      if (eventData.tz) updateData.tz = eventData.tz;
      if (eventData.all_day !== undefined) updateData.all_day = eventData.all_day;
      
      console.log(`Updating event with payload:`, JSON.stringify(updateData, null, 2));
      
      // Make the API request to update the event
      const updateResponse = await axios.put(
        `${baseUrl}/events/${eventId}`,
        updateData,
        {
          headers: {
            'Content-Type': 'application/json',
            'Teamup-Token': TEAMUP_API_KEY
          }
        }
      );
      
      console.log(`API response status: ${updateResponse.status}`);
      console.log(`Response data: ${JSON.stringify(updateResponse.data || {})}`);
      return true;
    } catch (axiosError) {
      console.error('❌ API request failed:', axiosError.message);
      
      if (axiosError.response) {
        console.error('Response status:', axiosError.response.status);
        console.error('Response data:', JSON.stringify(axiosError.response.data || {}));
        
        // Detailed logging for specific error types
        const errorId = axiosError.response.data?.error?.id;
        if (errorId === 'event_missing_start_end_datetime') {
          console.error('ERROR DETAILS: Missing start or end dates');
          console.error('start_dt:', axiosError.config?.data ? JSON.parse(axiosError.config.data).start_dt : 'unknown');
          console.error('end_dt:', axiosError.config?.data ? JSON.parse(axiosError.config.data).end_dt : 'unknown');
        } else if (errorId === 'validation_error') {
          console.error('ERROR DETAILS: Validation error - check all required fields are present');
          console.error('Payload was:', axiosError.config?.data);
        }
      } else {
        console.error('No response from server');
      }
      
      return false;
    }
  } catch (error) {
    console.error('❌ Error in updateEventZoomLink function:', error.message || error);
    return false;
  }
}

// Function to handle recurring events using Teamup's recommended approach
async function updateRecurringEventZoomLink(eventData, zoomLink) {
  try {
    console.log(`Handling recurring event with ID ${eventData.id}...`);
    
    if (!CALENDAR_ID || !TEAMUP_API_KEY) {
      console.error('❌ Missing required environment variables');
      return false;
    }
    
    const baseUrl = `https://api.teamup.com/${CALENDAR_ID}`;
    
    // Parse the event ID for the series_id
    // Ensure it's a numeric value as per Teamup support
    const baseEventId = parseInt(eventData.id.split('-rid-')[0]); 
    
    console.log(`Trying to update recurring event with series_id: ${baseEventId}`);
    
    // Create a proper copy of the custom fields
    const customFields = {};
    if (eventData.custom) {
      Object.keys(eventData.custom).forEach(key => {
        customFields[key] = eventData.custom[key];
      });
    }
    
    // Update our specific custom field
    customFields[CUSTOM_FIELD_NAME] = {
      html: zoomLink
    };
    
    // Create update payload exactly like Teamup support's example
    const updateData = {
      id: eventData.id, // Use the original event ID, not the instance ID
      series_id: baseEventId, // This is the critical field per Teamup support
      start_dt: eventData.start_dt,
      end_dt: eventData.end_dt,
      title: eventData.title || '',
      subcalendar_id: eventData.subcalendar_id,
      custom: customFields
    };
    
    // Add recurring event fields if this is a recurring event
    if (eventData.rrule) {
      updateData.rrule = eventData.rrule;
      
      // If we have ristart_dt, include it (important for recurring events)
      if (eventData.ristart_dt) {
        updateData.ristart_dt = eventData.ristart_dt;
      } else if (eventData.start_dt) {
        // Use start_dt as ristart_dt if not provided
        updateData.ristart_dt = eventData.start_dt;
      }
      
      // Specify we're only updating this single occurrence
      updateData.redit = 'single';
    }
    
    // Include version if available for concurrency control
    if (eventData.version) {
      updateData.version = eventData.version;
    }
    
    console.log(`Update payload:`, JSON.stringify(updateData, null, 2));
    
    // ATTEMPT 1: Try exactly as in Teamup's example
    try {
      console.log(`Attempt 1: Using original event ID in both URL and body`);
      
      const response = await axios.put(
        `${baseUrl}/events/${eventData.id}`,
        updateData,
        {
          headers: {
            'Content-Type': 'application/json',
            'Teamup-Token': TEAMUP_API_KEY
          }
        }
      );
      
      console.log(`Attempt 1 successful! Status: ${response.status}`);
      return true;
    } catch (attempt1Error) {
      console.log(`Attempt 1 failed: ${attempt1Error.message}`);
      console.log(`Status: ${attempt1Error.response?.status || 'unknown'}`);
      console.log(`Error details:`, JSON.stringify(attempt1Error.response?.data || {}, null, 2));
      
      // ATTEMPT 2: Try without the redit parameter
      try {
        console.log(`Attempt 2: Without redit parameter`);
        
        // Create a copy without the redit parameter
        const updateData2 = {...updateData};
        delete updateData2.redit;
        
        console.log(`Attempt 2 payload:`, JSON.stringify(updateData2, null, 2));
        
        const response2 = await axios.put(
          `${baseUrl}/events/${eventData.id}`,
          updateData2,
          {
            headers: {
              'Content-Type': 'application/json',
              'Teamup-Token': TEAMUP_API_KEY
            }
          }
        );
        
        console.log(`Attempt 2 successful! Status: ${response2.status}`);
        return true;
      } catch (attempt2Error) {
        console.log(`Attempt 2 failed: ${attempt2Error.message}`);
        console.log(`Status: ${attempt2Error.response?.status || 'unknown'}`);
        console.log(`Error details:`, JSON.stringify(attempt2Error.response?.data || {}, null, 2));
        
        // ATTEMPT 3: Try with redit=future instead of single
        try {
          console.log(`Attempt 3: With redit=future`);
          
          // Create a copy with redit=future
          const updateData3 = {...updateData, redit: 'future'};
          
          console.log(`Attempt 3 payload:`, JSON.stringify(updateData3, null, 2));
          
          const response3 = await axios.put(
            `${baseUrl}/events/${eventData.id}`,
            updateData3,
            {
              headers: {
                'Content-Type': 'application/json',
                'Teamup-Token': TEAMUP_API_KEY
              }
            }
          );
          
          console.log(`Attempt 3 successful! Status: ${response3.status}`);
          return true;
        } catch (attempt3Error) {
          console.log(`Attempt 3 failed: ${attempt3Error.message}`);
          console.log(`Status: ${attempt3Error.response?.status || 'unknown'}`);
          console.log(`Error details:`, JSON.stringify(attempt3Error.response?.data || {}, null, 2));
          
          // ATTEMPT 4: Try with minimal fields
          try {
            console.log(`Attempt 4: Minimal fields`);
            
            // Create a minimal payload with just the essential fields
            const minimalData = {
              id: eventData.id,
              series_id: baseEventId,
              custom: {
                [CUSTOM_FIELD_NAME]: {
                  html: zoomLink
                }
              }
            };
            
            // These fields are required
            if (eventData.start_dt) minimalData.start_dt = eventData.start_dt;
            if (eventData.end_dt) minimalData.end_dt = eventData.end_dt;
            if (eventData.subcalendar_id) minimalData.subcalendar_id = eventData.subcalendar_id;
            
            console.log(`Attempt 4 payload:`, JSON.stringify(minimalData, null, 2));
            
            const response4 = await axios.put(
              `${baseUrl}/events/${eventData.id}`,
              minimalData,
              {
                headers: {
                  'Content-Type': 'application/json',
                  'Teamup-Token': TEAMUP_API_KEY
                }
              }
            );
            
            console.log(`Attempt 4 successful! Status: ${response4.status}`);
            return true;
          } catch (attempt4Error) {
            console.log(`Attempt 4 failed: ${attempt4Error.message}`);
            console.log(`Status: ${attempt4Error.response?.status || 'unknown'}`);
            console.log(`Error details:`, JSON.stringify(attempt4Error.response?.data || {}, null, 2));
            
            // All attempts failed
            console.error('❌ ALL ATTEMPTS FAILED');
            return false;
          }
        }
      }
    }
  } catch (error) {
    console.error(`❌ Unhandled error in updateRecurringEventZoomLink: ${error.message}`);
    
    // Log all error details
    if (error.response) {
      console.error(`Response status: ${error.response.status}`);
      console.error(`Response data:`, JSON.stringify(error.response.data, null, 2));
    }
    
    if (error.config) {
      console.error(`Request URL: ${error.config.url}`);
      console.error(`Request method: ${error.config.method}`);
      console.error(`Request headers:`, JSON.stringify(error.config.headers, null, 2));
      console.error(`Request data:`, error.config.data);
    }
    
    return false;
  }
}

// Helper function to safely copy custom fields
function copyCustomFields(customData) {
  const customFields = {};
  
  if (customData) {
    Object.keys(customData).forEach(key => {
      customFields[key] = customData[key];
    });
  }
  
  return customFields;
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