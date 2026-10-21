FROM mcr.microsoft.com/playwright:v1.50.1-noble

WORKDIR /app

# Copy dependency specifications
COPY package*.json ./

# Install dependencies (Playwright is already bundled with browsers and OS libraries)
RUN npm install

# Copy application source code
COPY . .

ENV PORT=5001
EXPOSE 5001

CMD ["npm", "start"]
