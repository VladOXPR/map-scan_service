# Use the official Node.js runtime as the base image
FROM node:18-slim

# Set the working directory in the container
WORKDIR /app

# Copy package.json and package-lock.json
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy the rest of the application code
COPY . .

# Expose the port the app runs on
EXPOSE 8080

# Set PORT environment variable (Cloud Run will override this)
ENV PORT=8080

# Start the application
CMD ["node", "server.js"]
