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
    
    // Check if this is a master recurring event or an instance
    const isRecurringInstance = eventData.id.includes('-rid-');
    
    // Get the series ID (master event ID) 
    let seriesId;
    let instanceId = eventData.id;
    
    if (isRecurringInstance) {
      // For a recurring instance, extract the series ID from the instance ID
      seriesId = parseInt(eventData.id.split('-rid-')[0]);
      console.log(`This is a recurring instance. Extracted series_id ${seriesId} from instance ID ${eventData.id}`);
    } else {
      // For a master recurring event, the series ID is the event ID itself
      seriesId = parseInt(eventData.id);
      
      // If this is a master event but we have the rrule, we need to create an instance ID
      // This is because Teamup appears to require instance IDs for editing recurring events
      if (eventData.rrule && eventData.start_dt) {
        // Create a timestamp from the start date
        let startDate;
        if (typeof eventData.start_dt === 'string') {
          startDate = new Date(eventData.start_dt);
        } else if (typeof eventData.start_dt === 'number') {
          startDate = new Date(eventData.start_dt * 1000); // Convert Unix timestamp to milliseconds
        }
        
        if (startDate && !isNaN(startDate.getTime())) {
          const timestamp = Math.floor(startDate.getTime() / 1000); // Convert to seconds
          instanceId = `${seriesId}-rid-${timestamp}`;
          console.log(`Created instance ID ${instanceId} for master recurring event`);
        }
      }
      
      console.log(`This is a master recurring event with series_id ${seriesId}`);
    }
    
    // Extract or create ristart_dt (recurrence instance start date)
    let ristartDt = null;
    
    // 1. Try to extract from the instance ID
    if (isRecurringInstance) {
      const timestampPart = eventData.id.split('-rid-')[1];
      if (timestampPart) {
        const timestamp = parseInt(timestampPart);
        if (!isNaN(timestamp)) {
          const date = new Date(timestamp * 1000);
          ristartDt = date.toISOString();
          console.log(`Extracted ristart_dt from instance ID: ${ristartDt}`);
        }
      }
    }
    
    // 2. Use provided ristart_dt if available
    if (!ristartDt && eventData.ristart_dt) {
      ristartDt = eventData.ristart_dt;
      console.log(`Using provided ristart_dt: ${ristartDt}`);
    }
    
    // 3. As last resort, use start_dt
    if (!ristartDt && eventData.start_dt) {
      ristartDt = eventData.start_dt;
      console.log(`No ristart_dt available, using start_dt as fallback: ${ristartDt}`);
    }
    
    // Create a copy of the custom fields and update only the zoom_link2 field
    const customFields = {};
    if (eventData.custom) {
      Object.keys(eventData.custom).forEach(key => {
        customFields[key] = eventData.custom[key];
      });
    }
    
    customFields[CUSTOM_FIELD_NAME] = {
      html: zoomLink
    };
    
    // STEP 1: First try to get the current event to ensure we have all required fields
    try {
      console.log(`Getting current event details for ID: ${instanceId}`);
      
      const getResponse = await axios({
        method: 'get',
        url: `${baseUrl}/events/${instanceId}`,
        headers: {
          'Teamup-Token': TEAMUP_API_KEY
        }
      });
      
      const currentEvent = getResponse.data.event;
      console.log(`Successfully retrieved event details. Version: ${currentEvent.version || 'N/A'}`);
      
      // Only modify the custom field with the zoom link
      if (!currentEvent.custom) {
        currentEvent.custom = {};
      }
      currentEvent.custom[CUSTOM_FIELD_NAME] = { html: zoomLink };
      
      // Construct a payload according to Teamup's instructions
      // Include series_id (integer value of the event ID)
      const updatePayload = {
        id: instanceId,                  // Include the full instance ID with -rid- part
        series_id: seriesId,             // As per Teamup support, use the integer value
        redit: 'single',                 // Only update this specific instance
        ristart_dt: ristartDt,           // Required for recurring events
        custom: currentEvent.custom,     // Only change the custom fields
        // Required fields
        subcalendar_id: currentEvent.subcalendar_id,
        title: currentEvent.title || '',
        start_dt: currentEvent.start_dt,
        end_dt: currentEvent.end_dt,
        // Optional fields that should be preserved
        version: currentEvent.version
      };
      
      // Include other important fields if they exist in the current event
      if (currentEvent.all_day !== undefined) updatePayload.all_day = currentEvent.all_day;
      if (currentEvent.tz) updatePayload.tz = currentEvent.tz;
      if (currentEvent.location) updatePayload.location = currentEvent.location;
      if (currentEvent.who) updatePayload.who = currentEvent.who;
      
      // For the first attempt, specifically include the rrule if it exists
      // to preserve the recurrence pattern
      if (currentEvent.rrule) updatePayload.rrule = currentEvent.rrule;
      
      console.log(`Update payload:`, JSON.stringify(updatePayload, null, 2));
      
      // ATTEMPT 1: Full update following Teamup's recommendation
      console.log(`ATTEMPT 1: Updating with full payload including rrule`);
      try {
        const updateResponse = await axios.put(
          `${baseUrl}/events/${instanceId}`,
          updatePayload,
          {
            headers: {
              'Content-Type': 'application/json',
              'Teamup-Token': TEAMUP_API_KEY
            }
          }
        );
        
        console.log(`✅ ATTEMPT 1 successful! Status: ${updateResponse.status}`);
        return true;
      } catch (error1) {
        console.log(`❌ ATTEMPT 1 failed: ${error1.message}`);
        if (error1.response) {
          console.log(`Status: ${error1.response.status}`);
          console.log(`Error data:`, JSON.stringify(error1.response.data || {}, null, 2));
          
          // ATTEMPT 2: If overlap error, try again without rrule
          if (error1.response.data?.error?.id === 'event_overlapping') {
            console.log(`Detected overlapping error. Trying without rrule...`);
            
            // Create a copy without the rrule
            const updatePayloadNoRrule = {...updatePayload};
            delete updatePayloadNoRrule.rrule;
            
            console.log(`ATTEMPT 2 payload:`, JSON.stringify(updatePayloadNoRrule, null, 2));
            
            try {
              const response2 = await axios.put(
                `${baseUrl}/events/${instanceId}`,
                updatePayloadNoRrule,
                {
                  headers: {
                    'Content-Type': 'application/json',
                    'Teamup-Token': TEAMUP_API_KEY
                  }
                }
              );
              
              console.log(`✅ ATTEMPT 2 successful! Status: ${response2.status}`);
              return true;
            } catch (error2) {
              console.log(`❌ ATTEMPT 2 failed: ${error2.message}`);
              if (error2.response) {
                console.log(`Status: ${error2.response.status}`);
                console.log(`Error data:`, JSON.stringify(error2.response.data || {}, null, 2));
              }
              
              // ATTEMPT 3: Try with bare minimum fields
              console.log(`ATTEMPT 3: Using absolute minimal payload`);
              
              const minimalPayload = {
                id: instanceId,
                series_id: seriesId,
                subcalendar_id: currentEvent.subcalendar_id,
                start_dt: currentEvent.start_dt,
                end_dt: currentEvent.end_dt,
                title: currentEvent.title || '',
                custom: {
                  [CUSTOM_FIELD_NAME]: { html: zoomLink }
                },
                ristart_dt: ristartDt,
                redit: 'single'
              };
              
              console.log(`ATTEMPT 3 payload:`, JSON.stringify(minimalPayload, null, 2));
              
              try {
                const response3 = await axios.put(
                  `${baseUrl}/events/${instanceId}`,
                  minimalPayload,
                  {
                    headers: {
                      'Content-Type': 'application/json',
                      'Teamup-Token': TEAMUP_API_KEY
                    }
                  }
                );
                
                console.log(`✅ ATTEMPT 3 successful! Status: ${response3.status}`);
                return true;
              } catch (error3) {
                console.log(`❌ ATTEMPT 3 failed: ${error3.message}`);
                if (error3.response) {
                  console.log(`Status: ${error3.response.status}`);
                  console.log(`Error data:`, JSON.stringify(error3.response.data || {}, null, 2));
                }
                
                // Log the failure
                console.error(`⚠️ ALL ATTEMPTS FAILED for event ${eventData.id} - unable to update Zoom link`);
                console.error(`This appears to be a limitation of the Teamup API with recurring events on no-overlap calendars`);
                return false;
              }
            }
          } else {
            // If it's not an overlap error, just log the failure
            console.error(`⚠️ Failed to update event. Non-overlap error encountered.`);
            return false;
          }
        } else {
          console.error(`⚠️ Failed to update event. Network error encountered.`);
          return false;
        }
      }
    } catch (getError) {
      console.error(`❌ Failed to get event details: ${getError.message}`);
      if (getError.response) {
        console.error(`Status: ${getError.response.status}`);
        console.error(`Error data:`, JSON.stringify(getError.response.data || {}, null, 2));
      }
      return false;
    }
  } catch (error) {
    console.error(`❌ Unhandled error in updateRecurringEventZoomLink: ${error.message}`);
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