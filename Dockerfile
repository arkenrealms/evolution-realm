FROM node:20

WORKDIR /usr/src/app
RUN apt-get update
RUN apt-get install vim
RUN npm install -g @microsoft/rush ts-node-dev

COPY . .

COPY id_ed25519 /root/.ssh/id_ed25519
RUN chmod 600 /root/.ssh/id_ed25519
COPY ssh_config /root/.ssh/config
RUN ssh-keyscan github.com >> /root/.ssh/known_hosts

WORKDIR /usr/src/app
RUN git clone git@arkenbot:arken-engineering/arken.git
WORKDIR /usr/src/app/arken
RUN git submodule init
RUN git submodule update --remote --recursive
RUN rm rush.json
RUN mv rush.evolution.json rush.json
WORKDIR /usr/src/app/arken/packages/node
RUN git checkout dev
WORKDIR /usr/src/app/arken/packages/evolution
RUN git checkout main
RUN git submodule init
RUN git submodule update --remote --recursive
WORKDIR /usr/src/app/arken/packages/evolution/packages/protocol
RUN git checkout main
WORKDIR /usr/src/app/arken/packages/evolution/packages/shard
RUN git checkout main
WORKDIR /usr/src/app/arken/packages/evolution/packages/realm
RUN git checkout main
RUN rush update

EXPOSE 4010 4011 4020 4021

CMD ["sleep", "infinity"]
# CMD ["rushx dev"]