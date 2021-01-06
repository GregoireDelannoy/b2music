FROM node:13

WORKDIR /app

ADD . /app

RUN npm install express backblaze-b2 dotenv

EXPOSE 8004

CMD ["node", "app.js"]