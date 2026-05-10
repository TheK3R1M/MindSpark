FROM node:20

# Create app directory
WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm install

# Copy source code
COPY . .

# Build the app
RUN npm run build

# Serve the application
CMD ["npx", "serve", "-s", "dist", "-l", "7860"]
