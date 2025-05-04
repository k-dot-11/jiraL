import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import axios from "axios";
import dotenv from "dotenv";

// Load environment variables
dotenv.config();

const CONFLUENCE_DOMAIN = process.env.JIRA_DOMAIN;
const SPACE_KEY = "SD"; // Space key from the URL

// Base configuration for Confluence API
const confluenceInstance = axios.create({
    baseURL: `${CONFLUENCE_DOMAIN}/wiki/api/v2`,
    headers: {
        Authorization: `Basic ${Buffer.from(`${JIRA_EMAIL}:${JIRA_API}`).toString("base64")}`,
        Accept: "application/json",
        "Content-Type": "application/json",
    },
});

// Create an MCP server
const server = new McpServer({
    name: "Confluence MCP Server",
    version: "1.0.0",
    description: "MCP server for interacting with Confluence API",
});

// Tool: Get Page Content
server.tool(
    "get_page",
    {
        pageId: z.string().describe("The ID of the page to retrieve"),
    },
    async ({ pageId }) => {
        try {
            const pageInfo = await confluenceInstance.get(`/pages/${pageId}`);
            const pageContent = await confluenceInstance.get(
                `/pages/${pageId}?body-format=storage`
            );

            const response = {
                pageInfo: pageInfo.data,
                pageContent: pageContent.data,
            };
            return {
                content: [
                    {
                        type: "text",
                        text: JSON.stringify(response, null, 2),
                    },
                ],
            };
        } catch (error) {
            console.error("API Error:", error.response?.data || error.message);
            return {
                content: [
                    {
                        type: "text",
                        text: `Error fetching page: ${error.message}`,
                    },
                ],
            };
        }
    }
);

// Tool: Create Page
server.tool(
    "create_page",
    {
        title: z.string().describe("The title of the new page"),
        content: z.string().describe(
            `The content in Confluence Storage Format. Example template:
      <?xml version="1.0" encoding="UTF-8"?>
      <ac:confluence xmlns:ac="https://www.atlassian.com/schema/confluence/4/ac/">
        <p>Your content here</p>
        <ac:structured-macro ac:name="toc" />
      </ac:confluence>`
        ),
    },
    async ({ title, content }) => {
        try {
            const pageData = {
                spaceId: "65877",
                status: "current",
                title: title,
                body: {
                    representation: "storage",
                    value: content,
                },
            };
            console.log("Page Data:", pageData);
            const response = await confluenceInstance.post("/pages", pageData);
            return {
                content: [
                    {
                        type: "text",
                        text: `Page created successfully. ID: ${response.data.id} \n The web URL is ${CONFLUENCE_DOMAIN}/wiki/pages/${response.data.id}`,
                    },
                ],
            };
        } catch (error) {
            return {
                content: [
                    {
                        type: "text",
                        text: `Error creating page: ${error.message}`,
                    },
                ],
            };
        }
    }
);

// Tool: Update Page
server.tool(
    "update_page",
    {
        pageId: z.string().describe("The ID of the page to update"),
        title: z.string().optional().describe("The new title of the page"),
        content: z.string().optional().describe("The new content of the page in ATML format"),
    },
    async ({ pageId, title, content }) => {
        try {
            // First get the current version of the page
            const currentPage = await confluenceInstance.get(`/pages/${pageId}`);
            const version = currentPage.data.version.number;

            const updateData = {
                id: pageId,
                status: "current",
                version: {
                    number: version + 1,
                },
            };

            if (title) {
                updateData.title = title;
            }

            if (content) {
                updateData.body = {
                    representation: "atlas_doc_format",
                    value: content,
                };
            }

            await confluenceInstance.put(`/pages/${pageId}`, updateData);
            return {
                content: [
                    {
                        type: "text",
                        text: `Page ${pageId} updated successfully`,
                    },
                ],
            };
        } catch (error) {
            return {
                content: [
                    {
                        type: "text",
                        text: `Error updating page: ${error.message}`,
                    },
                ],
            };
        }
    }
);

// Tool: Search Pages
server.tool(
    "search_pages",
    {
        query: z.string().describe("The text to search for"),
        limit: z
            .number()
            .min(1)
            .max(100)
            .default(25)
            .describe("Maximum number of results to return"),
    },
    async ({ query, limit }) => {
        try {
            const response = await confluenceInstance.get("/search", {
                params: {
                    cql: `space="${SPACE_KEY}" and text ~ "${query}"`,
                    limit: limit,
                },
            });

            return {
                content: [
                    {
                        type: "text",
                        text: JSON.stringify(response.data.results, null, 2),
                    },
                ],
            };
        } catch (error) {
            return {
                content: [
                    {
                        type: "text",
                        text: `Error searching pages: ${error.message}`,
                    },
                ],
            };
        }
    }
);

// Tool: Get all pages in a space
server.tool(
    "get_pages",
    {
        spaceKey: z.string().describe("The key of the space to retrieve pages from"),
        limit: z
            .number()
            .min(1)
            .max(100)
            .default(25)
            .describe("Maximum number of results to return"),
    },
    async ({ spaceKey, limit }) => {
        try {
            const response = await confluenceInstance.get("/pages", {
                params: {
                    spaceKey: spaceKey,
                    limit: limit,
                },
            });

            return {
                content: [
                    {
                        type: "text",
                        text: JSON.stringify(response.data.results, null, 2),
                    },
                ],
            };
        } catch (error) {
            return {
                content: [
                    {
                        type: "text",
                        text: `Error retrieving pages: ${error.message}`,
                    },
                ],
            };
        }
    }
);

// Start receiving messages on stdin and sending messages on stdout
const transport = new StdioServerTransport();
console.error("Confluence MCP Server starting...");

await server.connect(transport);
