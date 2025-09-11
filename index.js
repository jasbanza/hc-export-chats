#!/usr/bin/env node

require('dotenv').config();
const axios = require('axios');
const fs = require('fs').promises;
const path = require('path');

class HelpCrunchExporter {
    constructor() {
        this.apiKey = process.env.HELPCRUNCH_API_KEY;
        this.apiSecret = process.env.HELPCRUNCH_API_SECRET;
        this.organizationId = process.env.HELPCRUNCH_ORGANIZATION_ID;
        this.fromDate = process.env.FROM_DATE || '2024-01-01';
        this.outputFile = process.env.OUTPUT_FILE || 'exported_chats.json';
        
        if (!this.apiKey || !this.apiSecret || !this.organizationId) {
            throw new Error('Missing required environment variables. Please check your .env file.');
        }

        // HelpCrunch API base URL
        this.baseURL = 'https://api.helpcrunch.com';
        
        // Create axios instance with authentication
        this.api = axios.create({
            baseURL: this.baseURL,
            auth: {
                username: this.apiKey,
                password: this.apiSecret
            },
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            }
        });
    }

    /**
     * Get all conversations from a specific date, filtered by organization
     */
    async getConversations() {
        console.log(`Fetching conversations from ${this.fromDate}...`);
        
        try {
            const conversations = [];
            let page = 1;
            let hasMore = true;

            while (hasMore) {
                console.log(`Fetching page ${page}...`);
                
                const response = await this.api.get('/chats', {
                    params: {
                        organization_id: this.organizationId,
                        created_at_from: this.fromDate,
                        page: page,
                        per_page: 100 // Maximum allowed per page
                    }
                });

                const data = response.data;
                
                if (data && data.data && Array.isArray(data.data)) {
                    conversations.push(...data.data);
                    
                    // Check if there are more pages
                    hasMore = data.data.length === 100; // If we got a full page, there might be more
                    page++;
                } else {
                    hasMore = false;
                }

                // Add a small delay to avoid rate limiting
                await this.sleep(100);
            }

            console.log(`Found ${conversations.length} conversations`);
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
            const response = await this.api.get(`/chats/${chatId}/messages`);
            return response.data.data || [];
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
            const messages = await this.getChatMessages(chatId);
            
            if (messages.length === 0) {
                return null;
            }

            // Sort messages by timestamp
            messages.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

            // Consolidate messages into a single string with user/agent tags
            let conversationText = '';
            
            for (const message of messages) {
                const timestamp = new Date(message.created_at).toISOString();
                const author = message.author;
                
                // Determine if this is a user or agent message
                let messageTag = 'USER';
                if (author && (author.type === 'agent' || author.is_agent)) {
                    messageTag = 'AGENT';
                }

                // Format the message with tag
                const messageContent = message.text || message.body || '';
                if (messageContent.trim()) {
                    conversationText += `[${messageTag}] ${messageContent.trim()}\n`;
                }
            }

            return {
                chatId: chatId,
                organizationId: this.organizationId,
                createdAt: conversation.created_at,
                updatedAt: conversation.updated_at,
                status: conversation.status,
                customerEmail: conversation.customer?.email || null,
                customerName: conversation.customer?.name || null,
                assignedAgent: conversation.assigned_agent?.name || null,
                messageCount: messages.length,
                conversationText: conversationText.trim()
            };

        } catch (error) {
            console.error(`Error processing conversation ${chatId}:`, error.message);
            return null;
        }
    }

    /**
     * Export all conversations and their messages
     */
    async export() {
        try {
            console.log('Starting HelpCrunch chat export...');
            console.log(`Organization ID: ${this.organizationId}`);
            console.log(`From Date: ${this.fromDate}`);
            console.log(`Output File: ${this.outputFile}`);

            // Get all conversations
            const conversations = await this.getConversations();
            
            if (conversations.length === 0) {
                console.log('No conversations found');
                return;
            }

            // Process each conversation
            const exportedChats = [];
            let processed = 0;

            for (const conversation of conversations) {
                const processedChat = await this.processConversation(conversation);
                
                if (processedChat) {
                    exportedChats.push(processedChat);
                }

                processed++;
                if (processed % 10 === 0) {
                    console.log(`Processed ${processed}/${conversations.length} conversations...`);
                }

                // Add delay to avoid rate limiting
                await this.sleep(200);
            }

            // Save to file
            const output = {
                exportedAt: new Date().toISOString(),
                organizationId: this.organizationId,
                fromDate: this.fromDate,
                totalConversations: conversations.length,
                exportedChats: exportedChats.length,
                chats: exportedChats
            };

            await fs.writeFile(this.outputFile, JSON.stringify(output, null, 2));
            
            console.log(`\nExport completed successfully!`);
            console.log(`Total conversations: ${conversations.length}`);
            console.log(`Successfully exported: ${exportedChats.length}`);
            console.log(`Output file: ${this.outputFile}`);

        } catch (error) {
            console.error('Export failed:', error.message);
            process.exit(1);
        }
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
    try {
        const exporter = new HelpCrunchExporter();
        await exporter.export();
    } catch (error) {
        console.error('Failed to initialize exporter:', error.message);
        console.log('\nPlease ensure you have:');
        console.log('1. Created a .env file based on .env.example');
        console.log('2. Added your HelpCrunch API credentials');
        console.log('3. Specified your organization ID');
        process.exit(1);
    }
}

// Run if this file is executed directly
if (require.main === module) {
    main();
}

module.exports = HelpCrunchExporter;