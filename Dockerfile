# Simple production Dockerfile - build locally first with: npm install && npm run build
FROM nginx:alpine

# Copy custom nginx config
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copy pre-built dist folder (run `npm run build` locally first)
COPY dist /usr/share/nginx/html

# Copy env-config script for runtime environment variables  
COPY public/env-config.js /usr/share/nginx/html/env-config.js

# Expose port 80
EXPOSE 80

# Start nginx
CMD ["nginx", "-g", "daemon off;"]
