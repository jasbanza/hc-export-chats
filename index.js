#!/usr/bin/env node

require('dotenv').config();
const axios = require('axios');
const fs = require('fs').promises;
const path = require('path');

class HelpCrunchExporter {
    constructor() {
        this.apiKey = process.env.HELPCRUNCH_API_KEY;
        this.organizationId = process.env.HELPCRUNCH_ORGANIZATION_ID;
        this.fromDate = process.env.FROM_DATE || '2024-01-01';
        this.outputFile = process.env.OUTPUT_FILE || 'exported_chats.json';
        this.cacheFile = process.env.CACHE_FILE || 'chat_cache.json';
        this.departmentFilter = process.env.HELPCRUNCH_ORGANIZATION_ID; // Use org ID as department filter
        
        if (!this.apiKey || !this.organizationId) {
            throw new Error('Missing required environment variables. Please check your .env file.');
        }

        // HelpCrunch API base URL
        this.baseURL = 'https://api.helpcrunch.com';
        
        // Create axios instance with authentication
        this.api = axios.create({
            baseURL: this.baseURL,
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'Authorization': 'Bearer ' + this.apiKey
            }
        });
    }

    /**
     * Load existing cache file
     */
    async loadCache() {
        try {
            const cacheData = await fs.readFile(this.cacheFile, 'utf8');
            const cache = JSON.parse(cacheData);
            console.log(`Loaded cache with ${cache.chats?.length || 0} existing chats`);
            console.log(`Last cache update: ${cache.lastUpdated || 'Never'}`);
            if (cache.lastProcessedBatch && cache.totalBatches) {
                console.log(`Last processed batch: ${cache.lastProcessedBatch}/${cache.totalBatches}`);
            }
            return cache;
        } catch (error) {
            console.log('No existing cache found, starting fresh');
            return {
                lastUpdated: null,
                lastProcessedTimestamp: null,
                lastProcessedBatch: 0,
                totalBatches: 0,
                chats: [],
                metadata: {
                    organizationId: this.organizationId,
                    departmentFilter: this.departmentFilter
                }
            };
        }
    }

    /**
     * Check if a conversation is already in cache
     */
    isConversationCached(cache, conversationId) {
        return cache.chats.some(chat => chat.chatId === conversationId.toString());
    }

    /**
     * Save cache file
     */
    async saveCache(cache) {
        try {
            cache.lastUpdated = new Date().toISOString();
            await fs.writeFile(this.cacheFile, JSON.stringify(cache, null, 2));
            console.log(`Cache saved with ${cache.chats.length} chats`);
        } catch (error) {
            console.error('Error saving cache:', error.message);
        }
    }

    /**
     * Clear cache file (useful for starting fresh)
     */
    async clearCache() {
        try {
            await fs.unlink(this.cacheFile);
            console.log('Cache cleared successfully');
        } catch (error) {
            console.log('No cache file to clear');
        }
    }

    /**
     * Merge new chats with cached chats, avoiding duplicates
     */
    mergeWithCache(cachedChats, newChats) {
        const existingIds = new Set(cachedChats.map(chat => chat.chatId));
        const uniqueNewChats = newChats.filter(chat => !existingIds.has(chat.chatId));
        
        console.log(`Found ${uniqueNewChats.length} new chats to add to cache`);
        
        return [...cachedChats, ...uniqueNewChats];
    }

    /**
     * Filter and format conversations based on department
     */
    filterConversationsByDepartment(conversations) {
        console.log(`Filtering conversations by department: ${this.departmentFilter}`);
        
        const filteredConversations = conversations.filter(conversation => {
            // To make up for times where the assignment rules were not made:
            // if department is empty, check assignee. If assignee = "Squid Team", then department = "SQUID", else "OSL"
            if (!conversation.department) {
                if (conversation.assignee || conversation.assigned_agent) {
                    const assigneeName = conversation.assignee?.name || conversation.assigned_agent?.name;
                    if (assigneeName === "Squid Team") {
                        conversation.department = { name: "SQUID" };
                    } else {
                        conversation.department = { name: "OSL" };
                    }
                }
            }

            // Apply department filter
            if (this.departmentFilter && conversation.department?.name !== this.departmentFilter) {
                return false;
            }

            return true;
        });

        console.log(`Filtered ${conversations.length} conversations down to ${filteredConversations.length} for department ${this.departmentFilter}`);
        return filteredConversations;
    }

    /**
     * Get all conversations from a specific date, filtered by organization
     */
    async getConversations() {
        console.log(`Fetching conversations from ${this.fromDate}...`);
        
        try {
            const conversations = [];
            let offset = 0; // Start from the beginning to find the most recent conversations
            let limit = 100;
            let hasMore = true;
            let batchCount = 0;
            
            while (hasMore) {
                console.log(`Fetching conversations (${offset} to ${limit + offset}) - Batch ${batchCount + 1}`);
                
                const url = `https://api.helpcrunch.com/v1/chats?sort=chats.createdAt&order=asc&offset=${offset}&limit=${limit}`;
                const response = await this.api.get(url);

                const data = response.data;
                
                if (data && data.data && Array.isArray(data.data)) {
                    console.log(`📅 First conversation date: ${new Date(data.data[0]?.createdAt * 1000).toISOString()}`);
                    console.log(`📅 Last conversation date: ${new Date(data.data[data.data.length - 1]?.createdAt * 1000).toISOString()}`);
                    
                    // Filter conversations by date from .env configuration
                    const filteredByDate = data.data.filter(conversation => {
                        const createdAt = new Date(conversation.createdAt * 1000);
                        const fromDate = new Date(this.fromDate);
                        return createdAt >= fromDate;
                    });
                    
                    console.log(`📅 Filtered ${data.data.length} conversations to ${filteredByDate.length} after ${this.fromDate}`);
                    conversations.push(...filteredByDate);
                    
                    // Check if there are more pages based on meta information
                    if (data?.meta?.total > offset + limit) {
                        offset += limit;
                        batchCount++;
                    } else {
                        hasMore = false;
                    }
                } else {
                    hasMore = false;
                }

                // Add a small delay to avoid rate limiting
                await this.sleep(100);
            }

            console.log(`Found ${conversations.length} conversations (total fetched across ${batchCount} batches)`);
            return conversations;
        } catch (error) {
            console.error('Error fetching conversations:', error.response?.data || error.message);
            throw error;
        }
    }

    /**
     * Get all messages for a specific chat
     */
    async getChatMessages(chatId) {
        try {
            // Try different possible endpoints for messages
            const possibleEndpoints = [
                `/v1/chats/${chatId}/messages`,
                `/chats/${chatId}/messages`, 
                `/v1/conversations/${chatId}/messages`,
                `/conversations/${chatId}/messages`,
                `/v1/chats/${chatId}`, // Sometimes messages are included in the chat detail
            ];

            for (const endpoint of possibleEndpoints) {
                try {
                    console.log(`  Trying endpoint: ${endpoint}`);
                    const response = await this.api.get(endpoint);
                    
                    if (response.data) {
                        // Check if this response has messages
                        if (response.data.data && Array.isArray(response.data.data)) {
                            console.log(`  ✅ Success! Found ${response.data.data.length} messages via ${endpoint}`);
                            
                            return response.data.data.slice(0, 100); // Limit to first 100 messages
                        } else if (response.data.messages && Array.isArray(response.data.messages)) {
                            console.log(`  ✅ Success! Found ${response.data.messages.length} messages via ${endpoint}`);
                            return response.data.messages.slice(0, 100); // Limit to first 100 messages
                        } else if (response.data && response.data.lastMessageText) {
                            console.log(`  ⚠️ Only found lastMessageText via ${endpoint}, no full messages array`);
                        }
                    }
                } catch (endpointError) {
                    console.log(`  ❌ Failed: ${endpoint} - ${endpointError.response?.status || endpointError.message}`);
                    continue;
                }
            }
            
            console.log(`  ❌ All endpoints failed for chat ${chatId}`);
            return [];
        } catch (error) {
            console.error(`Error fetching messages for chat ${chatId}:`, error.response?.data || error.message);
            return [];
        }
    }

    /**
     * Process a single conversation and format messages for AI training
     */
    async processConversation(conversation) {
        const chatId = conversation.id;
        console.log(`Processing conversation ${chatId}...`);

        try {
            // First, let's see what data is available in the conversation object
            if (Object.keys(conversation).length > 0) {
                console.log(`Conversation ${chatId} structure:`, Object.keys(conversation));
                
                // Check if messages are already included in the conversation
                if (conversation.messages && Array.isArray(conversation.messages)) {
                    console.log(`Conversation ${chatId} has ${conversation.messages.length} messages included`);
                    return this.formatConversationWithMessages(conversation, conversation.messages);
                } else {
                    // Try to fetch messages separately
                    const messages = await this.getChatMessages(chatId);
                    if (messages && messages.length > 0) {
                        return this.formatConversationWithMessages(conversation, messages);
                    } else {
                        // No messages available, just return metadata
                        return this.formatConversationMetadata(conversation);
                    }
                }
            }

            return null;

        } catch (error) {
            console.error(`Error processing conversation ${chatId}:`, error.message);
            return null;
        }
    }

    /**
     * Format conversation with messages
     */
    formatConversationWithMessages(conversation, messages) {
        if (messages.length === 0) {
            return this.formatConversationMetadata(conversation);
        }

        // Sort messages by timestamp
        messages.sort((a, b) => {
            const aTime = new Date(a.created_at || a.createdAt || a.timestamp);
            const bTime = new Date(b.created_at || b.createdAt || b.timestamp);
            return aTime - bTime;
        });

        // Consolidate messages into a single string with user/agent tags
        let conversationText = '';
        
        for (const message of messages) {
            // Handle different possible timestamp fields
            let timestamp;
            try {
                timestamp = new Date(message.created_at || message.createdAt || message.timestamp).toISOString();
            } catch (e) {
                timestamp = 'unknown-time';
            }
            
            // Determine if this is a user or agent message based on the 'from' field
            let messageTag = 'USER';  // Default to USER for customer messages
            if (message.from === 'agent') {
                messageTag = 'AGENT';
            }
            // Note: message.from === 'customer' will remain as 'USER' (default)

            // Skip system/technical messages like "request_rating", "resolution_time" etc.
            if (message.type === 'tech') {
                continue;
            }

            // Format the message with tag
            const messageContent = message.text || message.body || message.content || '';
            if (messageContent.trim()) {
                conversationText += `[${messageTag}] ${messageContent.trim()}\n`;
            }
        }

        return {
            chatId: conversation.id.toString(),
            organizationId: this.organizationId,
            createdAt: conversation.created_at || conversation.createdAt || null,
            updatedAt: conversation.updated_at || conversation.updatedAt || null,
            status: conversation.status,
            customerEmail: conversation.customer?.email || null,
            customerName: conversation.customer?.name || null,
            assignedAgent: conversation.assigned_agent?.name || conversation.assignee?.name || null,
            department: conversation.department?.name || null,
            messageCount: messages.length,
            conversationText: conversationText.trim(),
            hasMessages: true
        };
    }

    /**
     * Format conversation metadata only (when no messages available)
     */
    formatConversationMetadata(conversation) {
        return {
            chatId: conversation.id.toString(),
            organizationId: this.organizationId,
            createdAt: conversation.created_at || conversation.createdAt || null,
            updatedAt: conversation.updated_at || conversation.updatedAt || null,
            status: conversation.status,
            customerEmail: conversation.customer?.email || null,
            customerName: conversation.customer?.name || null,
            assignedAgent: conversation.assigned_agent?.name || conversation.assignee?.name || null,
            department: conversation.department?.name || null,
            messageCount: 0,
            conversationText: '',
            hasMessages: false
        };
    }

    /**
     * Export all conversations and their messages
     */
    async export() {
        try {
            console.log('Starting HelpCrunch chat export...');
            console.log(`Organization ID: ${this.organizationId}`);
            console.log(`Department Filter: ${this.departmentFilter}`);
            console.log(`From Date: ${this.fromDate}`);
            console.log(`Output File: ${this.outputFile}`);
            console.log(`Cache File: ${this.cacheFile}`);

            // Load existing cache
            let cache = await this.loadCache();

            // Get all conversations
            const conversations = await this.getConversations();
            
            if (conversations.length === 0) {
                console.log('No conversations found');
                return;
            }

            // Filter conversations by department
            const filteredConversations = this.filterConversationsByDepartment(conversations);
            
            if (filteredConversations.length === 0) {
                console.log(`No conversations found for department: ${this.departmentFilter}`);
                return;
            }

            // Filter out conversations that are already cached
            const uncachedConversations = filteredConversations.filter(conversation => 
                !this.isConversationCached(cache, conversation.id)
            );

            console.log(`Found ${uncachedConversations.length} new conversations to process (${filteredConversations.length - uncachedConversations.length} already cached)`);

            if (uncachedConversations.length === 0) {
                console.log('All conversations are already cached. Nothing new to process.');
                
                // Still save the final output file with all cached data
                const output = {
                    exportedAt: new Date().toISOString(),
                    organizationId: this.organizationId,
                    departmentFilter: this.departmentFilter,
                    fromDate: this.fromDate,
                    totalConversationsFound: conversations.length,
                    totalConversationsAfterFiltering: filteredConversations.length,
                    newChatsProcessed: 0,
                    totalExportedChats: cache.chats.length,
                    chats: cache.chats
                };

                await fs.writeFile(this.outputFile, JSON.stringify(output, null, 2));
                console.log(`Output file updated: ${this.outputFile}`);
                return;
            }

            // Process all uncached conversations 
            console.log(`\nProcessing all ${uncachedConversations.length} new conversations...`);

            // Process conversations in batches and save cache incrementally
            const batchSize = 10; // Process 10 conversations before saving cache
            let processed = 0;
            let newChatsCount = 0;

            for (let i = 0; i < uncachedConversations.length; i += batchSize) {
                const batch = uncachedConversations.slice(i, i + batchSize);
                const batchResults = [];

                console.log(`\nProcessing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(uncachedConversations.length / batchSize)} (conversations ${i + 1}-${Math.min(i + batchSize, uncachedConversations.length)})...`);

                // Process each conversation in the current batch
                for (const conversation of batch) {
                    const processedChat = await this.processConversation(conversation);
                    
                    if (processedChat) {
                        batchResults.push(processedChat);
                        newChatsCount++;
                    }

                    processed++;
                    if (processed % 10 === 0 || processed === uncachedConversations.length) {
                        console.log(`  Processed ${processed}/${uncachedConversations.length} conversations...`);
                    }

                    // Add delay to avoid rate limiting
                    await this.sleep(200);
                }

                // Add batch results to cache and save incrementally
                if (batchResults.length > 0) {
                    cache.chats.push(...batchResults);
                    cache.lastProcessedTimestamp = new Date().toISOString();
                    cache.lastProcessedBatch = Math.floor(i / batchSize) + 1;
                    cache.totalBatches = Math.ceil(uncachedConversations.length / batchSize);
                    
                    await this.saveCache(cache);
                    console.log(`  Batch ${Math.floor(i / batchSize) + 1} saved to cache (${batchResults.length} new chats)`);
                }
            }

            // Save final output file
            // Filter cached chats by date for final export
            const fromDateTimestamp = new Date(this.fromDate).getTime() / 1000;
            const filteredCachedChats = cache.chats.filter(chat => {
                const chatCreatedAt = parseInt(chat.createdAt);
                return chatCreatedAt >= fromDateTimestamp;
            });

            const output = {
                exportedAt: new Date().toISOString(),
                organizationId: this.organizationId,
                departmentFilter: this.departmentFilter,
                fromDate: this.fromDate,
                totalConversationsFound: conversations.length,
                totalConversationsAfterFiltering: filteredConversations.length,
                newChatsProcessed: newChatsCount,
                totalExportedChats: filteredCachedChats.length,
                chats: filteredCachedChats
            };

            await fs.writeFile(this.outputFile, JSON.stringify(output, null, 2));
            
            // Generate CSV summary
            console.log(`\nGenerating CSV summary...`);
            const csvContent = await this.generateCSVSummary(output);
            const csvFileName = this.outputFile.replace('.json', '_summary.csv');
            await fs.writeFile(csvFileName, csvContent);
            
            console.log(`\nExport completed successfully!`);
            console.log(`Total conversations found: ${conversations.length}`);
            console.log(`Conversations after department filtering (${this.departmentFilter}): ${filteredConversations.length}`);
            console.log(`New chats processed this run: ${newChatsCount}`);
            console.log(`Total exported chats (including cached): ${cache.chats.length}`);
            console.log(`Total exported chats after date filtering: ${filteredCachedChats.length}`);
            console.log(`Output file: ${this.outputFile}`);
            console.log(`CSV summary file: ${csvFileName}`);
            console.log(`Cache file: ${this.cacheFile}`);

        } catch (error) {
            console.error('Export failed:', error.message);
            console.error('Progress has been saved to cache. You can retry to continue from where it left off.');
            process.exit(1);
        }
    }

    /**
     * Categorize a conversation based on its content
     */
    categorizeConversation(conversationText, assignedAgent, customerName) {
        const text = conversationText.toLowerCase();
        
        // Define category keywords and patterns
        const categories = {
            'bridge provider': ['bridge', 'axelar', 'wormhole', 'ibc', 'gravity bridge', 'stargate', 'cosmos hub'],
            'cache': ['cache', 'caching', 'refresh', 'reload', 'clear cache', 'browser cache'],
            'deposit/withdrawal': ['deposit', 'withdrawal', 'withdraw', 'deposit funds', 'withdraw funds', 'binance', 'coinbase', 'kucoin', 'kraken'],
            'external team related': ['starname', 'stargaze', 'juno', 'akash', 'cosmos', 'terra', 'luna', 'secret', 'kava', 'evmos'],
            'fe bug': ['bug', 'error', 'broken', 'not working', 'issue', 'problem', 'frontend', 'ui bug', 'interface'],
            'general inquiry': ['how to', 'what is', 'explain', 'help', 'question', 'understand', 'tutorial', 'guide'],
            'glitch/can\'t reproduce': ['glitch', 'weird', 'strange', 'can\'t reproduce', 'cannot reproduce', 'intermittent', 'sometimes works'],
            'swaps': ['swap', 'swapping', 'trade', 'trading', 'exchange', 'convert', 'slippage', 'pool'],
            'ibc relayer': ['relayer', 'ibc', 'timeout', 'pending', 'stuck', 'failed transfer', 'cross chain'],
            'unclear ux': ['confusing', 'unclear', 'difficult', 'hard to', 'ux', 'user experience', 'design'],
            'spam/marketing': ['marketing', 'spam', 'promotion', 'advertisement', 'airdrop', 'free tokens']
        };
        
        // Score each category
        const scores = {};
        for (const [category, keywords] of Object.entries(categories)) {
            scores[category] = 0;
            for (const keyword of keywords) {
                const matches = (text.match(new RegExp(keyword, 'g')) || []).length;
                scores[category] += matches;
            }
        }
        
        // Find the category with the highest score
        const maxScore = Math.max(...Object.values(scores));
        if (maxScore === 0) {
            return 'general inquiry'; // Default category
        }
        
        const bestCategory = Object.keys(scores).find(category => scores[category] === maxScore);
        return bestCategory;
    }

    /**
     * Generate CSV summary of conversations
     */
    async generateCSVSummary(exportData) {
        const csvRows = [];
        
        // CSV header
        csvRows.push([
            'Chat ID',
            'Created Date',
            'Status',
            'Customer Name',
            'Customer Email', 
            'Assigned Agent',
            'Department',
            'Message Count',
            'Category',
            'First User Message',
            'Last Agent Response',
            'Conversation Summary'
        ].join(','));
        
        // Process each chat
        for (const chat of exportData.chats) {
            const messages = chat.conversationText.split('\n').filter(msg => msg.trim());
            
            // Find first user message and last agent response
            const firstUserMessage = messages.find(msg => msg.startsWith('[USER]'))?.replace('[USER]', '').trim() || '';
            const agentMessages = messages.filter(msg => msg.startsWith('[AGENT]'));
            const lastAgentResponse = agentMessages.length > 0 ? 
                agentMessages[agentMessages.length - 1].replace('[AGENT]', '').trim() : '';
            
            // Create conversation summary (first 200 chars)
            const summary = chat.conversationText.replace(/\[USER\]|\[AGENT\]/g, '').trim().substring(0, 200);
            
            // Categorize conversation
            const category = this.categorizeConversation(
                chat.conversationText, 
                chat.assignedAgent, 
                chat.customerName
            );
            
            // Create CSV row
            const row = [
                chat.chatId,
                new Date(parseInt(chat.createdAt) * 1000).toISOString().split('T')[0], // Date only
                chat.status,
                `"${(chat.customerName || '').replace(/"/g, '""')}"`, // Escape quotes
                `"${(chat.customerEmail || '').replace(/"/g, '""')}"`,
                `"${(chat.assignedAgent || '').replace(/"/g, '""')}"`,
                chat.department,
                chat.messageCount,
                category,
                `"${firstUserMessage.substring(0, 100).replace(/"/g, '""')}"`, // Limit length and escape
                `"${lastAgentResponse.substring(0, 100).replace(/"/g, '""')}"`,
                `"${summary.replace(/"/g, '""')}"`
            ];
            
            csvRows.push(row.join(','));
        }
        
        return csvRows.join('\n');
    }

    /**
     * Utility function to add delays
     */
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

// CLI interface
async function main() {
    const args = process.argv.slice(2);
    
    try {
        const exporter = new HelpCrunchExporter();
        
        // Check for clear cache command
        if (args.includes('--clear-cache')) {
            await exporter.clearCache();
            console.log('Cache cleared. Run without --clear-cache to start fresh export.');
            return;
        }
        
        await exporter.export();
    } catch (error) {
        console.error('Failed to initialize exporter:', error.message);
        console.log('\nPlease ensure you have:');
        console.log('1. Created a .env file based on .env.example');
        console.log('2. Added your HelpCrunch API credentials');
        console.log('3. Specified your organization ID');
        console.log('\nUsage:');
        console.log('  node index.js          - Run export');
        console.log('  node index.js --clear-cache - Clear cache and exit');
        process.exit(1);
    }
}

// Run if this file is executed directly
if (require.main === module) {
    main();
}

module.exports = HelpCrunchExporter;