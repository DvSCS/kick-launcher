FROM node:18-bullseye-slim

WORKDIR /app

COPY package.json package-lock.json* ./

RUN npm install

COPY . .

RUN npm run build

ENV PORT=7860
EXPOSE 7860

CMD ["npm", "run", "start", "--", "-p", "7860"]
