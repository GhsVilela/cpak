# Use the official Go image as base
FROM golang:1.21

# Install additional tools and dependencies
RUN apt-get update && export DEBIAN_FRONTEND=noninteractive \
    && apt-get -y install --no-install-recommends \
    git \
    curl \
    wget \
    vim \
    nano \
    build-essential \
    ca-certificates \
    sudo \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Install Docker CLI (for docker compose commands)
RUN curl -fsSL https://get.docker.com -o get-docker.sh && sh get-docker.sh && rm get-docker.sh

# Create a non-root user
ARG USERNAME=vscode
ARG USER_UID=1000
ARG USER_GID=$USER_UID

RUN groupadd --gid $USER_GID $USERNAME \
    && useradd --uid $USER_UID --gid $USER_GID -m $USERNAME \
    && echo $USERNAME ALL=\(root\) NOPASSWD:ALL > /etc/sudoers.d/$USERNAME \
    && chmod 0440 /etc/sudoers.d/$USERNAME

# Set the working directory
WORKDIR /workspace

# Switch to the non-root user
USER $USERNAME

# Set Go environment variables
ENV GOPATH=/home/$USERNAME/go
ENV PATH=$PATH:$GOPATH/bin

# Configure git to trust the workspace directory
RUN git config --global --add safe.directory /workspace

# Install Go tools as the vscode user
# Use GO111MODULE=on to ensure module mode
RUN GO111MODULE=on go install golang.org/x/tools/gopls@latest 2>&1 \
    && GO111MODULE=on go install github.com/go-delve/delve/cmd/dlv@latest 2>&1 \
    && GO111MODULE=on go install honnef.co/go/tools/cmd/staticcheck@latest 2>&1 \
    && GO111MODULE=on go install golang.org/x/tools/cmd/goimports@latest 2>&1
