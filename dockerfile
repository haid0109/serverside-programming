FROM node:14
ENV host=docker
WORKDIR /app
COPY ./views ./views
COPY ./cert ./cert
COPY package*.json .
COPY start.js .
RUN npm ci
CMD ["npm", "start"]
