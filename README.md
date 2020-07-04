# fastslam_web
Experimental fastslam algorithm web application. C++ application is running asynchronously, streaming particles positions to node.js server. Data is forwarded to client through socket.

I dockerized the nodejs/c++ app and put online with google cloud [here](35.242.140.13).

## Installation

To deploy locally:

1. Install [Docker](https://www.docker.com/get-started) on your machine.

2. Clone the repository

```
git clone https://github.com/pptacher/fastslam_web.git
```

3. Go to the root of the repository

```
cd fastslam_web
```

4. Build the docker image

```
docker build --tag=fastslam .
```

5. Run it

```
docker run -p 3000:3000 fastslam
```

6. Navigate to [http://localhost:3000](http://localhost:3000). If you use Docker through Linux virtual machine (MacOS), you may have to access the web app with something like [192.168.99.100:3000](http://192.168.99.100:3000).

See also  the [Docker cheat sheet](https://www.docker.com/sites/default/files/Docker_CheatSheet_08.09.2016_0.pdf).
