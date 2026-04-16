FROM signalk/signalk-server:latest
USER root
COPY settings.json /home/node/.signalk/settings.json
COPY plugin-config.json /home/node/.signalk/plugin-config-data/sk-to-nmea0183.json
RUN chown -R node:node /home/node/.signalk
USER node
