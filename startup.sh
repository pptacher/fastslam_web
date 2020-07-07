set -v

# Talk to the metadata server to get the project id
#PROJECTID=$(curl -s "http://metadata.google.internal/computeMetadata/v1/project/project-id" -H "Metadata-Flavor: Google")
#REPOSITORY="[YOUR-REPOSITORY]"

# Install logging monitor. The monitor will automatically pick up logs sent to
# syslog.
curl -s "https://storage.googleapis.com/signals-agents/logging/google-fluentd-install.sh" | bash
service google-fluentd restart &

apt-get update
apt-get install -yq ca-certificates git build-essential supervisor

# Get the application source code from the Google Cloud Repository.
# git requires $HOME and it's not set during the startup script.
export HOME=/root
git config --global credential.helper gcloud.sh

cd /opt/app
export LD_LIBRARY_PATH=$LD_LIBRARY_PATH:/opt/intel/compilers_and_libraries/linux/mkl/lib/intel64_lin:/opt/intel/compilers_and_libraries/linux/lib/intel64:/usr/local/lib64:/usr/local/lib:/usr/lib

# Create a nodeapp user. The application will run as this user.
useradd -m -d /home/nodeapp nodeapp
chown -R nodeapp:nodeapp /opt/app

# Configure supervisor to run the node app.
cat >/etc/supervisor/conf.d/node-app.conf << EOF
[program:nodeapp]
directory=/opt/app
command=npm start
autostart=true
autorestart=true
user=nodeapp
environment=HOME="/home/nodeapp",USER="nodeapp",NODE_ENV="production",PORT="8080", LD_LIBRARY_PATH="/opt/intel/compilers_and_libraries/linux/mkl/lib/intel64_lin:/opt/intel/compilers_and_libraries/linux/lib/intel64:/usr/local/lib64:/usr/local/lib:/usr/lib"
stdout_logfile=syslog
stderr_logfile=syslog
EOF

supervisorctl reread
supervisorctl update

# Application should now be running under supervisor
