FROM node:14

WORKDIR /usr/src/app
RUN apt-get update
RUN apt-get install nano
RUN npm install -g ts-node-dev

COPY . .

COPY id_ed25519 /root/.ssh/id_ed25519_evors
RUN chmod 600 /root/.ssh/id_ed25519_evors
COPY id_ed25519_sdk /root/.ssh/id_ed25519_sdk
RUN chmod 600 /root/.ssh/id_ed25519_sdk
COPY ssh_config /root/.ssh/config
RUN ssh-keyscan github.com >> /root/.ssh/known_hosts

# RUN git clone git@sdk:zeno-games/rune-backend-sdk.git
# WORKDIR /usr/src/app/rune-backend-sdk
# RUN git checkout 38625f33014c31f227fc1a8b82e2f9ed1b97a81a
# RUN yarn install
# RUN npm link

WORKDIR /usr/src/app
RUN git clone git@evors:zeno-games/evolution-realm-server.git
WORKDIR /usr/src/app/evolution-realm-server/game-server
RUN yarn install
RUN yarn run build
# RUN npm link rune-backend-sdk
RUN cd ..
RUN yarn install
RUN yarn run build

EXPOSE 4010 4011 4020 4021

CMD ["yarn run start"]