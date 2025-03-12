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
        title: eventData.title,
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

// Function to handle recurring events using the correct API mechanisms
async function updateRecurringEventZoomLink(eventData, zoomLink) {
  try {
    console.log(`Handling recurring event with ID ${eventData.id}...`);
    
    if (!CALENDAR_ID || !TEAMUP_API_KEY) {
      console.error('❌ Missing required environment variables');
      return false;
    }
    
    const baseUrl = `https://api.teamup.com/${CALENDAR_ID}`;
    
    // Parse the ID to check if it's already an instance ID
    const isInstanceId = eventData.id.includes('-rid-');
    console.log(`Is this an instance ID? ${isInstanceId}`);
    
    // For recurring events, we need to get the series ID and all instance details
    console.log(`Getting series information for recurring event...`);
    
    try {
      // First, get the full event data to ensure we have all necessary information
      const getResponse = await axios.get(
        `${baseUrl}/events/${eventData.id}`,
        {
          headers: {
            'Teamup-Token': TEAMUP_API_KEY
          }
        }
      );
      
      const eventDetails = getResponse.data.event;
      console.log(`Successfully retrieved event details with properties: ${Object.keys(eventDetails).join(', ')}`);
      
      // Look for series_id which is the ID of the recurring event template
      const seriesId = eventDetails.series_id;
      console.log(`Series ID: ${seriesId || 'Not found'}`);
      
      // Important fields for recurring events
      const remoteId = eventDetails.remote_id;
      const ristartDt = eventDetails.ristart_dt || eventDetails.start_dt;
      
      console.log(`Remote ID: ${remoteId || 'Not found'}`);
      console.log(`Recurrence Instance Start: ${ristartDt || 'Not found'}`);
      
      // METHOD 1: Try updating with path parameter eventId + matching id in body
      // -------------------------------------------------------------------
      try {
        console.log(`Trying Method 1: Path parameter eventId + matching id in body`);
        
        // Create a proper copy of the custom fields
        const customFields = {};
        if (eventDetails.custom) {
          Object.keys(eventDetails.custom).forEach(key => {
            customFields[key] = eventDetails.custom[key];
          });
        }
        
        // Update our specific custom field
        customFields[CUSTOM_FIELD_NAME] = { 
          html: zoomLink
        };
        
        // Create the update payload with all required and potentially helpful fields
        const updateData = {
          id: eventData.id,
          // Required time fields
          start_dt: eventDetails.start_dt,
          end_dt: eventDetails.end_dt,
          // Include recurrence fields
          rrule: eventDetails.rrule,
          ristart_dt: ristartDt,
          // Use redit to specify we're only updating this instance
          redit: 'single',
          // Other important fields
          title: eventDetails.title,
          subcalendar_id: eventDetails.subcalendar_id,
          // The custom field with our zoom link
          custom: customFields,
          // Include version for safety
          version: eventDetails.version
        };
        
        console.log(`Method 1 update payload (sample fields):`, {
          id: updateData.id,
          start_dt: updateData.start_dt,
          ristart_dt: updateData.ristart_dt,
          redit: updateData.redit
        });
        
        const updateResponse = await axios.put(
          `${baseUrl}/events/${eventData.id}`,
          updateData,
          {
            headers: {
              'Content-Type': 'application/json',
              'Teamup-Token': TEAMUP_API_KEY
            }
          }
        );
        
        console.log(`Method 1 successful! Status: ${updateResponse.status}`);
        return true;
      } catch (method1Error) {
        console.log(`Method 1 failed: ${method1Error.message}`);
        console.log(`Status: ${method1Error.response?.status}, Error ID: ${method1Error.response?.data?.error?.id || 'unknown'}`);
        
        // METHOD 2: Try with event's remote_id + ristart_dt 
        // -------------------------------------------------------------------
        try {
          console.log(`Trying Method 2: Using event's remote_id + ristart_dt in body`);
          
          // Make sure we have the needed fields
          if (!remoteId || !ristartDt) {
            console.log(`Cannot use Method 2: Missing remote_id or ristart_dt`);
            throw new Error('Missing required fields for Method 2');
          }
          
          // Create a proper copy of the custom fields
          const customFields = {};
          if (eventDetails.custom) {
            Object.keys(eventDetails.custom).forEach(key => {
              customFields[key] = eventDetails.custom[key];
            });
          }
          
          // Update our specific custom field
          customFields[CUSTOM_FIELD_NAME] = { 
            html: zoomLink
          };
          
          // Create an update payload focusing on remote_id and ristart_dt 
          const updateData = {
            remote_id: remoteId,
            ristart_dt: ristartDt,
            // Required time fields 
            start_dt: eventDetails.start_dt,
            end_dt: eventDetails.end_dt,
            // Use redit to specify we're only updating this instance
            redit: 'single',
            // Other important fields
            title: eventDetails.title,
            subcalendar_id: eventDetails.subcalendar_id,
            // The custom field with our zoom link
            custom: customFields
          };
          
          console.log(`Method 2 update payload (sample fields):`, {
            remote_id: updateData.remote_id,
            ristart_dt: updateData.ristart_dt,
            redit: updateData.redit
          });
          
          // Use the actual event ID for the URL
          const updateResponse = await axios.put(
            `${baseUrl}/events/${eventData.id}`,
            updateData,
            {
              headers: {
                'Content-Type': 'application/json',
                'Teamup-Token': TEAMUP_API_KEY
              }
            }
          );
          
          console.log(`Method 2 successful! Status: ${updateResponse.status}`);
          return true;
        } catch (method2Error) {
          console.log(`Method 2 failed: ${method2Error.message}`);
          console.log(`Status: ${method2Error.response?.status}, Error ID: ${method2Error.response?.data?.error?.id || 'unknown'}`);
          
          // METHOD 3: Try with eventId=0 and remoteId + startTime as query parameters
          // -------------------------------------------------------------------
          try {
            console.log(`Trying Method 3: Using eventId=0 and remoteId + startTime as query params`);
            
            // Make sure we have the needed fields
            if (!remoteId || !ristartDt) {
              console.log(`Cannot use Method 3: Missing remote_id or ristart_dt`);
              throw new Error('Missing required fields for Method 3');
            }
            
            // Create a proper copy of the custom fields
            const customFields = {};
            if (eventDetails.custom) {
              Object.keys(eventDetails.custom).forEach(key => {
                customFields[key] = eventDetails.custom[key];
              });
            }
            
            // Update our specific custom field
            customFields[CUSTOM_FIELD_NAME] = { 
              html: zoomLink
            };
            
            // Create a minimal update payload - we'll use query params for identification
            const updateData = {
              // Required time fields 
              start_dt: eventDetails.start_dt,
              end_dt: eventDetails.end_dt,
              // Other important fields
              title: eventDetails.title,
              subcalendar_id: eventDetails.subcalendar_id,
              // The custom field with our zoom link
              custom: customFields,
              // Use redit to specify we're only updating this instance 
              redit: 'single'
            };
            
            console.log(`Method 3 preparing request...`);
            
            // For Method 3, use eventId=0 with remoteId & startTime as query params
            const updateUrl = `${baseUrl}/events/0?remoteId=${encodeURIComponent(remoteId)}&startTime=${encodeURIComponent(ristartDt)}`;
            console.log(`Method 3 URL: ${updateUrl}`);
            
            const updateResponse = await axios.put(
              updateUrl,
              updateData,
              {
                headers: {
                  'Content-Type': 'application/json',
                  'Teamup-Token': TEAMUP_API_KEY
                }
              }
            );
            
            console.log(`Method 3 successful! Status: ${updateResponse.status}`);
            return true;
          } catch (method3Error) {
            console.log(`Method 3 failed: ${method3Error.message}`);
            console.log(`Status: ${method3Error.response?.status}, Error ID: ${method3Error.response?.data?.error?.id || 'unknown'}`);
            
            // All API methods have failed
            console.log(`❌ All API methods failed. Not using notes fallback as requested.`);
              // Return detailed diagnostic information for debugging
              console.error('❌ RECURRING EVENT UPDATE FAILED - ALL METHODS EXHAUSTED');
              console.error('DIAGNOSTICS:');
              console.error(`Event ID: ${eventData.id}`);
              console.error(`Series ID: ${seriesId || 'Not found'}`);
              console.error(`Remote ID: ${remoteId || 'Not found'}`);
              console.error(`RRULE: ${eventDetails.rrule || 'Not found'}`);
              console.error(`Start Time: ${eventDetails.start_dt || 'Not found'}`);
              console.error(`Instance Start: ${ristartDt || 'Not found'}`);
              
              return false;
          }
        }
      }
    } catch (getError) {
      console.error(`❌ Failed to get event details: ${getError.message}`);
      return false;
    }
  } catch (error) {
    console.error(`❌ Error in updateRecurringEventZoomLink: ${error.message}`);
    return false;
  }
}

// Try a complete update with all fields
async function tryCompleteUpdate(eventData, zoomLink) {
  try {
    console.log(`Trying complete update with all fields...`);
    
    const baseUrl = `https://api.teamup.com/${CALENDAR_ID}`;
    
    // Create a proper copy of the custom fields
    const customFields = copyCustomFields(eventData.custom);
    
    // Update our specific custom field
    customFields[CUSTOM_FIELD_NAME] = {
      html: zoomLink
    };
    
    // Create a complete update payload
    const updateData = {
      id: eventData.id,
      title: eventData.title,
      start_dt: eventData.start_dt,
      end_dt: eventData.end_dt,
      subcalendar_id: eventData.subcalendar_id,
      custom: customFields
    };
    
    // Add recurrence fields if present
    if (eventData.rrule) {
      updateData.rrule = eventData.rrule;
      updateData.ristart_dt = eventData.start_dt; // Use start_dt as ristart_dt
      updateData.redit = 'single'; // Only update this occurrence
    }
    
    // Add other important fields
    if (eventData.who) updateData.who = eventData.who;
    if (eventData.tz) updateData.tz = eventData.tz;
    if (eventData.all_day !== undefined) updateData.all_day = eventData.all_day;
    
    console.log(`Complete update payload:`, JSON.stringify(updateData, null, 2));
    
    try {
      const response = await makeApiRequest(
        `${baseUrl}/events/${eventData.id}`,
        updateData
      );
      
      console.log(`Complete update successful! API response status: ${response.status}`);
      return true;
    } catch (error) {
      console.error('❌ Complete update failed:', error.message);
      
      // If this fails, try the single occurrence update
      return await updateSingleOccurrence(eventData, zoomLink);
    }
  } catch (error) {
    console.error('❌ Error in tryCompleteUpdate function:', error.message || error);
    return false;
  }
}

// Try a middle ground approach - keep original event data but change custom field
async function tryMiddleGroundUpdate(eventData, zoomLink) {
  try {
    const baseUrl = `https://api.teamup.com/${CALENDAR_ID}`;
    
    // First, get the latest version of the event
    console.log(`Getting latest event data...`);
    
    try {
      const getResponse = await axios.get(
        `${baseUrl}/events/${eventData.id}`,
        {
          headers: {
            'Teamup-Token': TEAMUP_API_KEY
          }
        }
      );
      
      // Get the current event data
      const currentEvent = getResponse.data.event;
      console.log(`Successfully retrieved current event data`);
      
      // Only update the custom field
      if (!currentEvent.custom) {
        currentEvent.custom = {};
      }
      
      // Update our specific custom field
      currentEvent.custom[CUSTOM_FIELD_NAME] = {
        html: zoomLink
      };
      
      // Make a PUT request with the modified event data
      console.log(`Updating event with modified custom field...`);
      
      const response = await makeApiRequest(
        `${baseUrl}/events/${eventData.id}`,
        currentEvent
      );
      
      console.log(`Middle-ground update successful! API response status: ${response.status}`);
      return true;
    } catch (error) {
      console.error('❌ Middle-ground update failed:', error.message);
      
      // Try single occurrence update as a last resort
      return await updateSingleOccurrence(eventData, zoomLink);
    }
  } catch (error) {
    console.error('❌ Error in tryMiddleGroundUpdate function:', error.message || error);
    return false;
  }
}

// Helper function to update a single occurrence if series update fails
async function updateSingleOccurrence(eventData, zoomLink) {
  try {
    console.log(`Attempting to update single occurrence of recurring event ${eventData.id}...`);
    
    const baseUrl = `https://api.teamup.com/${CALENDAR_ID}`;
    
    // Create a proper copy of the custom fields
    const customFields = copyCustomFields(eventData.custom);
    
    // Update our specific custom field with raw link
    customFields[CUSTOM_FIELD_NAME] = {
      html: zoomLink
    };
    
    // Try PATCH first (partial update)
    try {
      console.log(`Trying PATCH method for single occurrence...`);
      
      const updateData = {
        id: eventData.id,
        custom: customFields
      };
      
      const response = await axios.patch(
        `${baseUrl}/events/${eventData.id}`,
        updateData,
        {
          headers: {
            'Content-Type': 'application/json',
            'Teamup-Token': TEAMUP_API_KEY
          }
        }
      );
      
      console.log(`PATCH successful! API response status: ${response.status}`);
      return true;
    } catch (patchError) {
      // If PATCH fails, use PUT with the minimal required fields
      console.log('PATCH failed, trying minimal PUT...');
      
      const putData = {
        id: eventData.id,
        start_dt: eventData.start_dt,
        end_dt: eventData.end_dt,
        title: eventData.title,
        subcalendar_id: eventData.subcalendar_id,
        custom: customFields
      };
      
      // Use start_dt for ristart_dt if it's a recurring event
      if (eventData.rrule) {
        putData.ristart_dt = eventData.start_dt;
        putData.redit = 'single'; // Only update this occurrence
      }
      
      try {
        const response = await makeApiRequest(
          `${baseUrl}/events/${eventData.id}`,
          putData
        );
        
        console.log(`PUT successful! API response status: ${response.status}`);
        return true;
      } catch (putError) {
        console.error('❌ PUT failed:', putError.message);
        
        // Last resort - try with scheduling conflict handling
        return await lastResortUpdate(
          eventData, 
          zoomLink, 
          putError.response?.data?.error?.id
        );
      }
    }
  } catch (error) {
    console.error('❌ Error in updateSingleOccurrence function:', error.message || error);
    return false;
  }
}

// Last resort update approach
async function lastResortUpdate(eventData, zoomLink, errorId) {
  try {
    console.log(`Attempting last resort update for error: ${errorId}`);
    
    const baseUrl = `https://api.teamup.com/${CALENDAR_ID}`;
    
    // If it's a scheduling conflict, we won't be able to update the event
    if (errorId === 'event_overlapping') {
      console.log('⚠️ Scheduling conflict detected. Attempting to update only the custom field without changing other properties.');
      
      // Try one more approach - just update the custom field via a GET and PUT without changing anything else
      try {
        // First, get the latest version of the event
        const getResponse = await axios.get(
          `${baseUrl}/events/${eventData.id}`,
          {
            headers: {
              'Teamup-Token': TEAMUP_API_KEY
            }
          }
        );
        
        // Get the current event data
        const currentEvent = getResponse.data.event;
        
        // Only update the custom field
        if (!currentEvent.custom) {
          currentEvent.custom = {};
        }
        
        // Update our specific custom field
        currentEvent.custom[CUSTOM_FIELD_NAME] = {
          html: zoomLink
        };
        
        // Make a copy of all fields without modification
        const updateData = { ...currentEvent };
        
        console.log(`Minimal update with only custom field change:`, JSON.stringify(updateData.custom, null, 2));
        
        // Try the update
        const response = await makeApiRequest(
          `${baseUrl}/events/${eventData.id}`,
          updateData
        );
        
        console.log(`Last resort update successful! API response status: ${response.status}`);
        return true;
      } catch (error) {
        console.log('❌ Unable to update event due to scheduling conflict. Zoom link cannot be added.');
        return false;
      }
    }
    
    // Create a proper copy of the custom fields
    const customFields = copyCustomFields(eventData.custom);
    
    // Update our specific custom field with the raw link value
    customFields[CUSTOM_FIELD_NAME] = {
      html: zoomLink
    };
    
    // Create a very minimal payload - just the absolute essentials
    const updateData = {
      id: eventData.id,
      title: eventData.title,
      start_dt: eventData.start_dt,
      end_dt: eventData.end_dt,
      subcalendar_id: eventData.subcalendar_id,
      custom: customFields
    };
    
    // Special handling for specific errors
    if (errorId === 'incomplete_request' || errorId === 'event_missing_start_end_datetime') {
      updateData.ristart_dt = eventData.start_dt;
      
      // If start_dt and end_dt are in different time zones, normalize them
      if (eventData.tz) {
        updateData.tz = eventData.tz;
      }
    }
    
    console.log(`Last resort update with payload:`, JSON.stringify(updateData, null, 2));
    
    try {
      const response = await makeApiRequest(
        `${baseUrl}/events/${eventData.id}`,
        updateData
      );
      
      console.log(`Last resort update successful! API response status: ${response.status}`);
      return true;
    } catch (error) {
      console.error('❌ Last resort update failed:', error.message);
      
      // Log the full error details
      if (error.response) {
        console.error('Status:', error.response.status);
        console.error('Error data:', JSON.stringify(error.response.data || {}));
      }
      
      return false;
    }
  } catch (error) {
    console.error('❌ Error in lastResortUpdate function:', error.message || error);
    return false;
  }
}

// Helper function to make API requests
async function makeApiRequest(url, data) {
  return await axios.put(
    url,
    data,
    {
      headers: {
        'Content-Type': 'application/json',
        'Teamup-Token': TEAMUP_API_KEY
      }
    }
  );
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