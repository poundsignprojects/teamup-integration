// Helper function to update a single occurrence if series update fails
async function updateSingleOccurrence(eventData, zoomLink) {
  try {
    console.log(`Attempting to update single occurrence of recurring event ${eventData.id}...`);
    
    const baseUrl = `https://api.teamup.com/${CALENDAR_ID}`;
    
    // Create a proper copy of the custom fields
    const customFields = {};
    if (eventData.custom) {
      Object.keys(eventData.custom).forEach(key => {
        customFields[key] = eventData.custom[key];
      });
    }
    
    // Update our specific custom field with raw link
    customFields[CUSTOM_FIELD_NAME] = {
      html: zoomLink
    };
    
    // Try a different endpoint for single occurrences - just update the custom field
    const updateData = {
      id: eventData.id,
      custom: customFields
    };
    
    console.log(`Updating single occurrence with payload:`, JSON.stringify(updateData, null, 2));
    
    // Try PATCH first (partial update)
    try {
      const updateResponse = await axios.patch(
        `${baseUrl}/events/${eventData.id}`,
        updateData,
        {
          headers: {
            'Content-Type': 'application/json',
            'Teamup-Token': TEAMUP_API_KEY
          }
        }
      );
      
      console.log(`API response status: ${updateResponse.status}`);
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
      }
      
      const putResponse = await axios.put(
        `${baseUrl}/events/${eventData.id}`,
        putData,
        {
          headers: {
            'Content-Type': 'application/json',
            'Teamup-Token': TEAMUP_API_KEY
          }
        }
      );
      
      console.log(`PUT response status: ${putResponse.status}`);
      return true;
    }
  } catch (error) {
    console.error('❌ Error updating single occurrence:', error.message);
    return false;
  }
}// Function to handle recurring events - uses event data directly from webhook
async function updateRecurringEventZoomLink(eventData, zoomLink) {
  try {
    console.log(`Handling recurring event with ID ${eventData.id}...`);
    
    // Check required environment variables
    if (!CALENDAR_ID) {
      console.error('❌ CALENDAR_ID environment variable is not set');
      return false;
    }
    
    if (!TEAMUP_API_KEY) {
      console.error('❌ TEAMUP_API_KEY environment variable is not set');
      return false;
    }
    
    // For recurring events, we'll use a special approach
    // Instead of trying to update the recurrence pattern, we'll just update the custom field
    
    // Create a proper copy of the custom fields
    const customFields = {};
    if (eventData.custom) {
      Object.keys(eventData.custom).forEach(key => {
        customFields[key] = eventData.custom[key];
      });
    }
    
    // Update our specific custom field with the raw link value
    customFields[CUSTOM_FIELD_NAME] = {
      html: zoomLink
    };
    
    // Try a simpler approach for recurring events - avoid updating the series pattern entirely
    // Just update the custom field and preserve everything else
    const baseUrl = `https://api.teamup.com/${CALENDAR_ID}`;
    
    // Only include the absolutely essential fields needed
    // For recurring events, we must include ALL time-related fields
    const updateData = {
      id: eventData.id,
      title: eventData.title,
      start_dt: eventData.start_dt,
      end_dt: eventData.end_dt,
      subcalendar_id: eventData.subcalendar_id, // Keep original subcalendar
      rrule: eventData.rrule,
      custom: customFields
    };
    
    // Add all time-related fields if they exist
    if (eventData.ristart_dt) updateData.ristart_dt = eventData.ristart_dt;
    if (eventData.rsstart_dt) updateData.rsstart_dt = eventData.rsstart_dt;
    
    // If ristart_dt is null but we have a recurrence rule (rrule), set ristart_dt to start_dt
    if (!updateData.ristart_dt && eventData.rrule) {
      updateData.ristart_dt = eventData.start_dt;
    }
    
    console.log(`Updating recurring event with payload:`, JSON.stringify(updateData, null, 2));
    
    try {
      // Make the API request to update the event
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
      
      console.log(`API response status: ${updateResponse.status}`);
      console.log(`Response data: ${JSON.stringify(updateResponse.data || {})}`);
      return true;
    } catch (axiosError) {
      console.error('❌ API request failed:', axiosError.message);
      
      if (axiosError.response) {
        console.error('Response status:', axiosError.response.status);
        console.error('Response data:', JSON.stringify(axiosError.response.data || {}));
        
        // Log more details about the error
        if (axiosError.response.data?.error) {
          console.error('Error details:', axiosError.response.data.error);
        }
        
        // Try one more approach if we have a specific error
        const errorId = axiosError.response.data?.error?.id;
        if (errorId) {
          return await lastResortUpdate(eventData, zoomLink, errorId);
        }
      }
      
      return false;
    }
  } catch (error) {
    console.error('❌ Error in updateRecurringEventZoomLink function:', error.message || error);
    return false;
  }
}

// Last resort update approach
async function lastResortUpdate(eventData, zoomLink, errorId) {
  try {
    console.log(`Attempting last resort update for error: ${errorId}`);
    
    const baseUrl = `https://api.teamup.com/${CALENDAR_ID}`;
    
    // Create a proper copy of the custom fields
    const customFields = {};
    if (eventData.custom) {
      Object.keys(eventData.custom).forEach(key => {
        customFields[key] = eventData.custom[key];
      });
    }
    
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
    
    console.log(`API response status: ${updateResponse.status}`);
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
}// Teamup Webhook Handler
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
      
      // No HTML formatting - just use the raw link
      const zoomLinkValue = zoomLink;
      
      // Create a proper copy of the custom fields
      const customFields = {};
      if (eventData.custom) {
        Object.keys(eventData.custom).forEach(key => {
          customFields[key] = eventData.custom[key];
        });
      }
      
      // Update our specific custom field with the raw value
      customFields[CUSTOM_FIELD_NAME] = {
        html: zoomLinkValue
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