import supabase from "../SupabaseClient";

/**
 * WhatsApp Messaging Service
 * Sends task notifications to users via WhatsApp
 */


// Master toggle to enable/disable WhatsApp messaging
const IS_WHATSAPP_ENABLED = true; // Set to true to enable WhatsApp messages

// WhatsApp API Configuration (Meta Cloud API)
const WHATSAPP_API_URL = import.meta.env.VITE_WHATSAPP_API_URL || 'https://graph.facebook.com/v21.0';
const WHATSAPP_PHONE_NUMBER_ID = import.meta.env.VITE_WHATSAPP_PHONE_NUMBER_ID;
const WHATSAPP_ACCESS_TOKEN = import.meta.env.VITE_WHATSAPP_ACCESS_TOKEN;
const WHATSAPP_WABA_ID = import.meta.env.VITE_WHATSAPP_WABA_ID;

const APP_LINK = "https://checklistdelegation.vercel.app/login";

/**
 * Check if WhatsApp service is enabled/connected
 * @returns {boolean}
 */
export const isWhatsAppConnected = () => IS_WHATSAPP_ENABLED;


/**
 * Format phone number to international format
 * @param {string} phone - Phone number (can be with or without country code)
 * @returns {string} - Formatted phone number with country code
 */
const formatPhoneNumber = (phone) => {
    if (!phone) return null;

    // Remove all non-digit characters
    let cleaned = String(phone).replace(/\D/g, '');

    // If doesn't start with country code, assume India (+91)
    if (!cleaned.startsWith('91') && cleaned.length === 10) {
        cleaned = '91' + cleaned;
    }

    return cleaned;
};

/**
 * Get user phone number from database
 * @param {string} username - Username to fetch phone for
 * @returns {Promise<string|null>} - Phone number or null
 */
const getUserPhoneNumber = async (username) => {
    try {
        console.log(`🔍 Fetching phone for user: "${username}"`);
        const { data, error } = await supabase
            .from('users')
            .select('number')
            .eq('user_name', username)
            .limit(1);

        if (error) {
            console.error('Supabase User Fetch Error:', error);
            throw error;
        }

        if (!data || data.length === 0) {
            console.warn(`⚠️ User "${username}" not found in database.`);
            return null;
        }

        return data[0]?.number || null;
    } catch (error) {
        console.error('Error fetching user phone:', error);
        return null;
    }
};

/**
 * Send WhatsApp message using Maytapi API
 * @param {string} phoneNumber - Recipient phone number
 * @param {string} message - Message text
 * @returns {Promise<boolean>} - Success status
 */
const sendWhatsAppMessage = async (phoneNumber, message) => {
    try {
        const formattedPhone = formatPhoneNumber(phoneNumber);
        if (!formattedPhone) {
            console.error('Invalid phone number:', phoneNumber);
            return false;
        }

        // Master toggle check
        if (!IS_WHATSAPP_ENABLED) {
            console.log('🚫 WhatsApp Messaging is currently DISABLED');
            console.log(`Recipient: +${formattedPhone}`);
            console.log(`Message: ${message}`);
            return true; // Return true to avoid errors in calling components
        }

        // If API credentials are not configured, log to console instead
        if (!WHATSAPP_ACCESS_TOKEN || !WHATSAPP_PHONE_NUMBER_ID) {
            console.log('📱 WhatsApp Message (API not configured):');
            console.log(`To: +${formattedPhone}`);
            console.log(`Message: ${message}`);
            console.log('---');
            return true; // Return true for development
        }

        const url = `${WHATSAPP_API_URL}/${WHATSAPP_PHONE_NUMBER_ID}/messages`;

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${WHATSAPP_ACCESS_TOKEN}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                messaging_product: "whatsapp",
                recipient_type: "individual",
                to: formattedPhone,
                type: "text",
                text: {
                    body: message
                }
            })
        });

        const result = await response.json();

        if (!response.ok) {
            console.error('Meta WhatsApp API Error:', response.status, response.statusText);
            console.error('Meta WhatsApp API Error Response:', JSON.stringify(result, null, 2));
            return false;
        }

        console.log('✅ WhatsApp message sent successfully via Meta:', result);
        return true;
    } catch (error) {
        console.error('Error sending WhatsApp message:', error);
        return false;
    }
};

/**
 * Send WhatsApp message using Meta Template API
 * @param {string} phoneNumber - Recipient phone number
 * @param {string} templateName - Name of the template
 * @param {Array} parameters - Array of parameter values for the template
 * @param {string} languageCode - Language code (default: 'en')
 * @returns {Promise<boolean>} - Success status
 */
const sendWhatsAppTemplate = async (phoneNumber, templateName, parameters = [], languageCode = 'en') => {
    try {
        const formattedPhone = formatPhoneNumber(phoneNumber);
        if (!formattedPhone) {
            console.error('Invalid phone number:', phoneNumber);
            return false;
        }

        // Master toggle check
        if (!IS_WHATSAPP_ENABLED) {
            console.log('🚫 WhatsApp Template Messaging is currently DISABLED');
            console.log(`Template: ${templateName}`);
            console.log(`To: +${formattedPhone}`);
            return true;
        }

        // If API credentials are not configured, log to console instead
        if (!WHATSAPP_ACCESS_TOKEN || !WHATSAPP_PHONE_NUMBER_ID) {
            console.log(`📱 WhatsApp Template Message (API not configured): ${templateName}`);
            console.log(`To: +${formattedPhone}`);
            console.log(`Params: ${JSON.stringify(parameters)}`);
            return true;
        }

        const url = `${WHATSAPP_API_URL}/${WHATSAPP_PHONE_NUMBER_ID}/messages`;

        const body = {
            messaging_product: "whatsapp",
            recipient_type: "individual",
            to: formattedPhone,
            type: "template",
            template: {
                name: templateName,
                language: {
                    code: languageCode
                },
                components: [
                    {
                        type: "body",
                        parameters: parameters.map(val => ({
                            type: "text",
                            text: String(val || 'N/A')
                        }))
                    }
                ]
            }
        };

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${WHATSAPP_ACCESS_TOKEN}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(body)
        });

        const result = await response.json();

        if (!response.ok) {
            console.error(`Meta Template API Error (${templateName}):`, response.status, response.statusText);
            console.error('Response:', JSON.stringify(result, null, 2));
            return false;
        }

        console.log(`✅ WhatsApp template "${templateName}" sent successfully:`, result);
        return true;
    } catch (error) {
        console.error(`Error sending WhatsApp template "${templateName}":`, error);
        return false;
    }
};

/**
 * Send WhatsApp voice message (PTT/Audio) using Maytapi API
 * @param {string} phoneNumber - Recipient phone number
 * @param {string} audioUrl - Public URL of the audio file
 * @returns {Promise<boolean>} - Success status
 */
const sendWhatsAppVoiceMessage = async (phoneNumber, audioUrl) => {
    try {
        const formattedPhone = formatPhoneNumber(phoneNumber);

        if (!formattedPhone) {
            console.error('Invalid phone number for voice message:', phoneNumber);
            return false;
        }

        // Master toggle check
        if (!IS_WHATSAPP_ENABLED) {
            console.log('🚫 WhatsApp Voice Messaging is currently DISABLED');
            console.log(`To: +${formattedPhone}`);
            return true;
        }

        // Development fallback
        if (!WHATSAPP_ACCESS_TOKEN || !WHATSAPP_PHONE_NUMBER_ID) {
            console.log('🎤 WhatsApp Voice Message (API not configured):');
            console.log(`To: +${formattedPhone}`);
            console.log(`Audio URL: ${audioUrl}`);
            return true;
        }

        const url = `${WHATSAPP_API_URL}/${WHATSAPP_PHONE_NUMBER_ID}/messages`;

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${WHATSAPP_ACCESS_TOKEN}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                messaging_product: "whatsapp",
                recipient_type: "individual",
                to: formattedPhone,
                type: "audio",
                audio: {
                    link: audioUrl
                }
            })
        });

        const result = await response.json();

        if (!response.ok) {
            console.error('Meta WhatsApp Voice API Error:', response.status, response.statusText);
            console.error('Meta WhatsApp Voice API Error Response:', JSON.stringify(result, null, 2));
            return false;
        }

        console.log('✅ WhatsApp voice message sent successfully via Meta:', result);
        return true;
    } catch (error) {
        console.error('Error sending WhatsApp voice message:', error);
        return false;
    }
};

/**
 * Send urgent task notification
 */
export const sendUrgentTaskNotification = async (taskDetails) => {
    try {
        const {
            doerName,
            taskId,
            description,
            dueDate,
            givenBy,
            taskType,
            machineName,
            partName,
            department
        } = taskDetails;

        const phoneNumber = await getUserPhoneNumber(doerName);
        if (!phoneNumber) return false;

        const urlRegex = /(https?:\/\/[^\s]+(?:voice-notes|audio-recordings)[^\s]*\.(?:mp3|ogg|wav|webm|m4a)?)/i;
        const match = description && description.match(urlRegex);
        const audioUrl = taskDetails.audioUrl || (match ? match[0] : null);
        const displayDescription = (audioUrl && description?.trim() === audioUrl) ? `🎤 Voice Note: ${audioUrl}` : description;

        // Template: urgent_task_assigned
        // Variables: {{1}} doerName, {{2}} taskId, {{3}} description, {{4}} startDate, {{5}} givenBy, {{6}} link
        const sent = await sendWhatsAppTemplate(
            phoneNumber,
            'urgent_task_assigned',
            [doerName, taskId, displayDescription, dueDate, givenBy, APP_LINK]
        );

        if (sent && audioUrl) {
            await new Promise(r => setTimeout(r, 1000));
            await sendWhatsAppVoiceMessage(phoneNumber, audioUrl);
        }
        return sent;
    } catch (error) {
        console.error('Error sending urgent notification:', error);
        return false;
    }
};

/**
 * Send checklist task notification
 */
export const sendChecklistTaskNotification = async (taskDetails) => {
    try {
        const { doerName, taskId, description, startDate, givenBy, department, duration } = taskDetails;
        const phoneNumber = await getUserPhoneNumber(doerName);
        if (!phoneNumber) return false;

        const urlRegex = /(https?:\/\/[^\s]+(?:voice-notes|audio-recordings)[^\s]*\.(?:mp3|ogg|wav|webm|m4a)?)/i;
        const match = description && description.match(urlRegex);
        const audioUrl = taskDetails.audioUrl || (match ? match[0] : null);
        const displayDescription = (audioUrl && description?.trim() === audioUrl) ? `🎤 Voice Note: ${audioUrl}` : description;

        // Template: checklist_task_notification
        // Variables: {{1}} doerName, {{2}} taskId, {{3}} department, {{4}} description, {{5}} startDate, {{6}} duration, {{7}} givenBy, {{8}} link
        const sent = await sendWhatsAppTemplate(
            phoneNumber,
            'checklist_task_notification',
            [doerName, taskId, department || 'N/A', displayDescription, startDate, duration || 'N/A', givenBy, APP_LINK]
        );

        if (sent && audioUrl) {
            await new Promise(r => setTimeout(r, 1000));
            await sendWhatsAppVoiceMessage(phoneNumber, audioUrl);
        }
        return sent;
    } catch (error) {
        console.error('Error sending checklist notification:', error);
        return false;
    }
};

/**
 * Send maintenance task notification
 */
export const sendMaintenanceTaskNotification = async (taskDetails) => {
    try {
        const { doerName, taskId, description, startDate, givenBy, machineName, partName, department, duration } = taskDetails;
        const phoneNumber = await getUserPhoneNumber(doerName);
        if (!phoneNumber) return false;

        const urlRegex = /(https?:\/\/[^\s]+(?:voice-notes|audio-recordings)[^\s]*\.(?:mp3|ogg|wav|webm|m4a)?)/i;
        const match = description && description.match(urlRegex);
        const audioUrl = taskDetails.audioUrl || (match ? match[0] : null);
        const displayDescription = (audioUrl && description?.trim() === audioUrl) ? `🎤 Voice Note: ${audioUrl}` : description;

        // Template: maintenance_task_assigned
        // Variables: {{1}} doerName, {{2}} taskId, {{3}} machineName, {{4}} partName, {{5}} department, {{6}} description, {{7}} startDate, {{8}} duration, {{9}} givenBy, {{10}} link
        const sent = await sendWhatsAppTemplate(
            phoneNumber,
            'maintenance_task_assigned',
            [doerName, taskId, machineName || 'N/A', partName || 'N/A', department || 'N/A', displayDescription, startDate, duration || 'N/A', givenBy, APP_LINK]
        );

        if (sent && audioUrl) {
            await new Promise(r => setTimeout(r, 1000));
            await sendWhatsAppVoiceMessage(phoneNumber, audioUrl);
        }
        return sent;
    } catch (error) {
        console.error('Error sending maintenance notification:', error);
        return false;
    }
};

/**
 * Send repair task notification
 */
export const sendRepairTaskNotification = async (taskDetails) => {
    try {
        const { doerName, taskId, description, startDate, givenBy, machineName, department, duration } = taskDetails;
        const phoneNumber = await getUserPhoneNumber(doerName);
        if (!phoneNumber) return false;

        const urlRegex = /(https?:\/\/[^\s]+(?:voice-notes|audio-recordings)[^\s]*\.(?:mp3|ogg|wav|webm|m4a)?)/i;
        const match = description && description.match(urlRegex);
        const audioUrl = taskDetails.audioUrl || (match ? match[0] : null);
        const displayDescription = (audioUrl && description?.trim() === audioUrl) ? `🎤 Voice Note: ${audioUrl}` : description;

        // Template: repair_task_notification
        // Variables: {{1}} doerName, {{2}} taskId, {{3}} machineName, {{4}} department, {{5}} description, {{6}} startDate, {{7}} duration, {{8}} givenBy, {{9}} link
        const sent = await sendWhatsAppTemplate(
            phoneNumber,
            'repair_task_notification',
            [doerName, taskId, machineName || 'N/A', department || 'N/A', displayDescription, startDate, duration || 'N/A', givenBy, APP_LINK]
        );

        if (sent && audioUrl) {
            await new Promise(r => setTimeout(r, 1000));
            await sendWhatsAppVoiceMessage(phoneNumber, audioUrl);
        }
        return sent;
    } catch (error) {
        console.error('Error sending repair notification:', error);
        return false;
    }
};

/**
 * Send EA task notification
 */
export const sendEATaskNotification = async (taskDetails) => {
    try {
        const { doerName, taskId, description, startDate, givenBy, duration } = taskDetails;
        const phoneNumber = await getUserPhoneNumber(doerName);
        if (!phoneNumber) return false;

        const urlRegex = /(https?:\/\/[^\s]+(?:voice-notes|audio-recordings)[^\s]*\.(?:mp3|ogg|wav|webm|m4a)?)/i;
        const match = description && description.match(urlRegex);
        const audioUrl = taskDetails.audioUrl || (match ? match[0] : null);
        const displayDescription = (audioUrl && description?.trim() === audioUrl) ? `🎤 Voice Note: ${audioUrl}` : description;

        // Template: ea_task_notification
        // Variables: {{1}} doerName, {{2}} taskId, {{3}} description, {{4}} startDate, {{5}} duration, {{6}} givenBy, {{7}} link
        const sent = await sendWhatsAppTemplate(
            phoneNumber,
            'ea_task_notification',
            [doerName, taskId, displayDescription, startDate, duration || 'N/A', givenBy, APP_LINK]
        );

        if (sent && audioUrl) {
            await new Promise(r => setTimeout(r, 1000));
            await sendWhatsAppVoiceMessage(phoneNumber, audioUrl);
        }
        return sent;
    } catch (error) {
        console.error('Error sending EA notification:', error);
        return false;
    }
};

/**
 * Send delegation task notification
 */
export const sendDelegationTaskNotification = async (taskDetails) => {
    try {
        const { doerName, taskId, description, startDate, givenBy, department, duration, attachmentRequired } = taskDetails;
        const phoneNumber = await getUserPhoneNumber(doerName);
        if (!phoneNumber) return false;

        const urlRegex = /(https?:\/\/[^\s]+(?:voice-notes|audio-recordings)[^\s]*\.(?:mp3|ogg|wav|webm|m4a)?)/i;
        const match = description && description.match(urlRegex);
        const audioUrl = taskDetails.audioUrl || (match ? match[0] : null);
        const displayDescription = (audioUrl && description?.trim() === audioUrl) ? `🎤 Voice Note: ${audioUrl}` : description;

        // Template: new_task_assign (APPROVED)
        // Variables:
        // {{1}} doerName - Person assigned to the task
        // {{2}} givenBy - Person who assigned the task
        // {{3}} department - Department name
        // {{4}} description - Task description
        // {{5}} startDate - Task start date
        // {{6}} duration - Basis (e.g., "urgent", "weekly", "monthly")
        // {{7}} reminders - Reminder information
        // {{8}} attachmentRequired - Whether attachment is required (Yes/No)
        const sent = await sendWhatsAppTemplate(
            phoneNumber,
            'new_task_assign',
            [
                doerName,                    // {{1}} - Task assignee
                givenBy,                     // {{2}} - Task assignor
                department || 'N/A',         // {{3}} - Department
                displayDescription || 'N/A', // {{4}} - Task description
                startDate || 'N/A',          // {{5}} - Start date
                duration || 'standard',      // {{6}} - Basis (urgent/weekly/monthly)
                'Set reminders as needed',   // {{7}} - Reminders
                attachmentRequired ? 'Yes' : 'No' // {{8}} - Attachment required
            ],
            'en' // Language code
        );

        if (sent && audioUrl) {
            await new Promise(r => setTimeout(r, 1000));
            await sendWhatsAppVoiceMessage(phoneNumber, audioUrl);
        }
        return sent;
    } catch (error) {
        console.error('Error sending delegation notification:', error);
        return false;
    }
};

/**
 * Send task extension notification
 */
export const sendTaskExtensionNotification = async (taskDetails) => {
    try {
        const { doerName, taskId, givenBy, description, nextExtendDate } = taskDetails;
        const phoneNumber = await getUserPhoneNumber(doerName);

        if (!phoneNumber) return false;

        // Extract audio URL from description if present
        const urlRegex = /(https?:\/\/[^\s]+(?:voice-notes|audio-recordings)[^\s]*\.(?:mp3|ogg|wav|webm|m4a)?)/i;
        const match = description && description.match(urlRegex);
        const audioUrl = taskDetails.audioUrl || (match ? match[0] : null);

        // If description is JUST the URL, enhance it
        const displayDescription = (audioUrl && description?.trim() === audioUrl)
            ? `🎤 Voice Note: ${audioUrl}`
            : description;

        // Template: extend_task_reminder (APPROVED)
        // Variables:
        // {{1}} taskId - Task ID
        // {{2}} doerName - Name of person assigned
        // {{3}} description - Task description
        // {{4}} givenBy - Person who assigned the task
        // {{5}} nextExtendDate - New extended deadline
        const sent = await sendWhatsAppTemplate(
            phoneNumber,
            'extend_task_reminder',
            [
                taskId || 'N/A',              // {{1}} - Task ID
                doerName,                     // {{2}} - Name
                displayDescription || 'N/A',  // {{3}} - Task description
                givenBy,                      // {{4}} - Given By
                nextExtendDate || 'N/A'       // {{5}} - Next Extended Date
            ],
            'en' // Language code
        );

        if (sent && audioUrl) {
            await new Promise(r => setTimeout(r, 1000));
            await sendWhatsAppVoiceMessage(phoneNumber, audioUrl);
        }

        return sent;
    } catch (error) {
        console.error('Error sending extension notification:', error);
        return false;
    }
};

/**
 * Send task assignment notification (Delegation Task)
 */
export const sendTaskAssignmentNotification = async (taskDetails) => {
    const { taskType } = taskDetails;

    switch (taskType?.toLowerCase()) {
        case 'checklist':
            return sendChecklistTaskNotification(taskDetails);
        case 'maintenance':
            return sendMaintenanceTaskNotification(taskDetails);
        case 'repair':
            return sendRepairTaskNotification(taskDetails);
        case 'ea':
            return sendEATaskNotification(taskDetails);
        case 'delegation':
            return sendDelegationTaskNotification(taskDetails);
        default:
            // For backward compatibility or if type is not provided
            try {
                const {
                    doerName,
                    taskId,
                    givenBy,
                    description,
                    startDate,
                } = taskDetails;

                const phoneNumber = await getUserPhoneNumber(doerName);

                if (!phoneNumber) {
                    console.warn(`No phone number found for user: ${doerName}`);
                    return false;
                }

                const urlRegex = /(https?:\/\/[^\s]+(?:voice-notes|audio-recordings)[^\s]*\.(?:mp3|ogg|wav|webm|m4a)?)/i;
                const match = description && description.match(urlRegex);
                const audioUrl = taskDetails.audioUrl || (match ? match[0] : null);
                const displayDescription = (audioUrl && description?.trim() === audioUrl) ? `🎤 Voice Note Link: ${audioUrl}` : description;

                const message = `🔔 *REMINDER: DELEGATION TASK*\n` +
                    `Dear ${doerName},\n\n` +
                    `You have been assigned a new task. Please find the details below:\n\n` +
                    `📌 Task ID: ${taskId}\n` +
                    `🧑 Allocated By: ${givenBy}\n` +
                    `📝 Task Description: ${displayDescription}\n\n\n` +
                    `⏳ Deadline: ${startDate}\n` +
                    `✅ Closure Link: https://checklist-delegation-supabase-five.vercel.app/login\n` +
                    `Please make sure the task is completed before the deadline. For any assistance, feel free to reach out.\n\n` +
                    `Best regards,\n` +
                    `Acemark Stationers.`;

                const sent = await sendWhatsAppMessage(phoneNumber, message);
                if (sent && audioUrl) {
                    await new Promise(r => setTimeout(r, 1000));
                    await sendWhatsAppVoiceMessage(phoneNumber, audioUrl);
                }
                return sent;
            } catch (error) {
                console.error('Error sending task assignment notification:', error);
                return false;
            }
    }
};

/**
 * DEPRECATED - use sendTaskAssignmentNotification
 */
const formatTaskMessage = (taskDetails) => {
    return "Please use specific notification functions";
};

/**
 * Send task reminder notification
 * @param {Object} taskDetails - Task details
 * @returns {Promise<boolean>} - Success status
 */
export const sendTaskReminderNotification = async (taskDetails) => {
    try {
        const { doerName, description, dueDate } = taskDetails;

        const phoneNumber = await getUserPhoneNumber(doerName);

        if (!phoneNumber) {
            console.warn(`No phone number found for user: ${doerName}`);
            return false;
        }

        // Template: pending_task_reminder
        // Variables: {{1}} doerName, {{2}} description, {{3}} dueDate, {{4}} link
        return await sendWhatsAppTemplate(
            phoneNumber,
            'pending_task_reminder',
            [doerName, description, dueDate, APP_LINK]
        );
    } catch (error) {
        console.error('Error sending task reminder:', error);
        return false;
    }
};

/**
 * Send task completion notification to admin
 * @param {Object} taskDetails - Task details
 * @returns {Promise<boolean>} - Success status
 */
export const sendTaskCompletionNotification = async (taskDetails) => {
    try {
        const { givenBy, doerName, description, completedAt } = taskDetails;

        const phoneNumber = await getUserPhoneNumber(givenBy);

        if (!phoneNumber) {
            console.warn(`No phone number found for admin: ${givenBy}`);
            return false;
        }

        // Template: task_completed_notification
        // Variables: {{1}} description, {{2}} completedAt, {{3}} doerName
        return await sendWhatsAppTemplate(
            phoneNumber,
            'task_completed_notification',
            [description, completedAt, doerName]
        );
    } catch (error) {
        console.error('Error sending completion notification:', error);
        return false;
    }
};



/**
 * Send task rejection notification
 */
export const sendTaskRejectionNotification = async (taskDetails) => {
    try {
        const { doerName, taskId, description, taskType, reason } = taskDetails;
        const phoneNumber = await getUserPhoneNumber(doerName);

        if (!phoneNumber) {
            console.warn(`No phone number found for user: ${doerName}`);
            return false;
        }

        // Template: task_rejected_notification
        // Variables: {{1}} doerName, {{2}} taskId, {{3}} description, {{4}} reason, {{5}} link
        return await sendWhatsAppTemplate(
            phoneNumber,
            'task_rejected_notification',
            [doerName, taskId, description || 'N/A', reason || 'No reason provided', APP_LINK]
        );
    } catch (error) {
        console.error('Error sending rejection notification:', error);
        return false;
    }
};

/**
 * Send task reassignment notification (Shifted Task)
 */
export const sendTaskReassignmentNotification = async (taskDetails) => {
    try {
        const {
            newDoerName,
            originalDoerName,
            taskId,
            description,
            startDate,
            givenBy,
            department,
            taskType
        } = taskDetails;

        const phoneNumber = await getUserPhoneNumber(newDoerName);
        if (!phoneNumber) return false;

        const urlRegex = /(https?:\/\/[^\s]+(?:voice-notes|audio-recordings)[^\s]*\.(?:mp3|ogg|wav|webm|m4a)?)/i;
        const match = description && description.match(urlRegex);
        const audioUrl = taskDetails.audioUrl || (match ? match[0] : null);
        const displayDescription = (audioUrl && description?.trim() === audioUrl) ? `🎤 Voice Note: ${audioUrl}` : description;

        // Template: task_transfer_notification
        // Variables: {{1}} doerName, {{2}} taskId, {{3}} taskType, {{4}} department, {{5}} description, {{6}} startDate, {{7}} link, {{8}} originalDoerName
        const sent = await sendWhatsAppTemplate(
            phoneNumber,
            'task_transfer_notification',
            [newDoerName, taskId, taskType || 'TASK', department || 'N/A', displayDescription, startDate, APP_LINK, originalDoerName]
        );

        if (sent && audioUrl) {
            await new Promise(r => setTimeout(r, 1000));
            await sendWhatsAppVoiceMessage(phoneNumber, audioUrl);
        }
        return sent;
    } catch (error) {
        console.error('Error sending reassignment notification:', error);
        return false;
    }
};

/**
 * Send Password Reset OTP to Admin
 */
export const sendPasswordResetOTP = async (username, otp) => {
    try {
        const adminNumber = "9028105766";
        const message = `🔐 *PASSWORD RESET REQUEST*\n\n` +
            `A password reset has been requested for:\n` +
            `👤 User: *${username}*\n` +
            `🔢 OTP Code: *${otp}*\n\n` +
            `Please provide this code to the user if the request is valid.\n\n` +
            `_Acemark Stationers_`;

        return await sendWhatsAppMessage(adminNumber, message);
    } catch (error) {
        console.error('Error sending password reset OTP:', error);
        return false;
    }
};

/**
 * Send admin remark notification for task extension
 */
export const sendAdminExtensionRemarkNotification = async (taskDetails) => {
    try {
        const { doerName, taskId, description, remark } = taskDetails;
        const phoneNumber = await getUserPhoneNumber(doerName);

        if (!phoneNumber) return false;

        const message = `📝 *ADMIN REMARK ON EXTENSION*\n` +
            `Dear ${doerName},\n\n` +
            `Admin has added a remark regarding your task extension request.\n\n` +
            `📌 Task ID: ${taskId}\n` +
            `📋 Task: ${description || 'N/A'}\n` +
            `💬 Remark: *${remark}*\n\n` +
            `🔗 App Link: https://checklist-delegation-supabase-five.vercel.app/login\n\n` +
            `Best regards,\nAcemark Stationers.`;

        return await sendWhatsAppMessage(phoneNumber, message);
    } catch (error) {
        console.error('Error sending extension remark notification:', error);
        return false;
    }
};

/**
 * Send daily task summary notification
 * @param {Object} summaryDetails - Summary details
 * @returns {Promise<boolean>} - Success status
 */
export const sendDailyTaskSummaryNotification = async (summaryDetails) => {
    try {
        const { doerName, totalTasks, pendingTasks, todayTasks, focusTasks } = summaryDetails;
        const phoneNumber = await getUserPhoneNumber(doerName);
        if (!phoneNumber) return false;

        // Template: daily_reminder (APPROVED)
        // Variables:
        // {{1}} doerName - Person's name
        // {{2}} totalTasks - Total number of tasks
        // {{3}} todayTasks - Today's tasks
        // {{4}} pendingTasks - Pending tasks count
        // {{5}} focusTasks - Focus tasks for today
        // {{6}} APP_LINK - Link to complete tasks
        const sent = await sendWhatsAppTemplate(
            phoneNumber,
            'daily_reminder',
            [
                doerName,                     // {{1}} - Hello {name}
                totalTasks || '0',            // {{2}} - Total Tasks
                todayTasks || '0',            // {{3}} - Today's Tasks
                pendingTasks || '0',          // {{4}} - Pending Tasks
                focusTasks || 'No specific tasks', // {{5}} - Focus Tasks for Today
                APP_LINK                      // {{6}} - Link to complete tasks
            ],
            'en' // Language code
        );

        return sent;
    } catch (error) {
        console.error('Error sending daily task summary:', error);
        return false;
    }
};

/**
 * Send purchase delivered notification
 * @param {Object} deliveryDetails - Delivery details
 * @returns {Promise<boolean>} - Success status
 */
export const sendPurchaseDeliveredNotification = async (deliveryDetails) => {
    try {
        const { recipientName, transporterName, lrNo, date, productName, size1, size2 } = deliveryDetails;
        const phoneNumber = await getUserPhoneNumber(recipientName);
        if (!phoneNumber) return false;

        // Template: purchase_delivered
        // Variables: {{1}} TransporterName, {{2}} LRNo, {{3}} Date, {{4}} ProductName, {{5}} Size1, {{6}} Size2
        return await sendWhatsAppTemplate(
            phoneNumber,
            'purchase_delivered',
            [transporterName, lrNo, date, productName, size1, size2]
        );
    } catch (error) {
        console.error('Error sending purchase delivered notification:', error);
        return false;
    }
};

export default {
    sendUrgentTaskNotification,
    sendTaskExtensionNotification,
    sendTaskAssignmentNotification,
    sendChecklistTaskNotification,
    sendMaintenanceTaskNotification,
    sendRepairTaskNotification,
    sendEATaskNotification,
    sendDelegationTaskNotification,
    sendTaskReminderNotification,
    sendTaskCompletionNotification,
    sendTaskRejectionNotification,
    sendTaskReassignmentNotification,
    sendPasswordResetOTP,
    sendAdminExtensionRemarkNotification,
    sendDailyTaskSummaryNotification,
    sendPurchaseDeliveredNotification
};
