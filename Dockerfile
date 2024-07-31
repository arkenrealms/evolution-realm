FROM node:20

WORKDIR /usr/src/app
RUN apt-get update
RUN apt-get install nano
RUN npm install -g ts-node-dev

COPY . .

COPY id_ed25519 /root/.ssh/id_ed25519
RUN chmod 600 /root/.ssh/id_ed25519
COPY ssh_config /root/.ssh/config
RUN ssh-keyscan github.com >> /root/.ssh/known_hosts

WORKDIR /usr/src/app
RUN git clone git@arkenbot:arken/evolution-realm.git
WORKDIR /usr/src/app/evolution-realm/game-server
RUN yarn install
RUN yarn run build

RUN cd ..
RUN yarn install
RUN yarn run build

EXPOSE 4010 4011 4020 4021

CMD ["yarn run start"]