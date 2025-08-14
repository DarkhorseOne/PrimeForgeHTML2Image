#!/bin/bash

# Docker Compose Control Script for HTML to Image Service
# Usage: ./docker-control.sh [command]

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
COMPOSE_FILE="docker-compose.yml"
SERVICE_NAME="html-to-image"
DEFAULT_PORT=3000

# Functions
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

show_help() {
    echo "Docker Compose Control Script for HTML to Image Service"
    echo ""
    echo "Usage: $0 [command] [options]"
    echo ""
    echo "Commands:"
    echo "  start       - Start the service"
    echo "  stop        - Stop the service"
    echo "  restart     - Restart the service"
    echo "  status      - Show service status"
    echo "  logs        - Show service logs (live)"
    echo "  logs-tail   - Show last 100 lines of logs"
    echo "  build       - Build/rebuild the Docker image"
    echo "  rebuild     - Force rebuild without cache"
    echo "  pull        - Pull latest base images"
    echo "  ps          - Show running containers"
    echo "  exec        - Execute command in container"
    echo "  shell       - Open shell in container"
    echo "  down        - Stop and remove containers"
    echo "  clean       - Remove containers, networks, and images"
    echo "  test        - Test the service with a sample request"
    echo "  help        - Show this help message"
    echo ""
    echo "Examples:"
    echo "  $0 start              # Start the service"
    echo "  $0 logs               # View live logs"
    echo "  $0 exec npm list      # Run npm list in container"
    echo "  $0 test               # Test with sample request"
}

check_docker() {
    if ! command -v docker &> /dev/null; then
        print_error "Docker is not installed or not in PATH"
        exit 1
    fi
    
    if ! command -v docker-compose &> /dev/null && ! docker compose version &> /dev/null; then
        print_error "Docker Compose is not installed"
        exit 1
    fi
    
    # Determine docker-compose command
    if docker compose version &> /dev/null; then
        DOCKER_COMPOSE="docker compose"
    else
        DOCKER_COMPOSE="docker-compose"
    fi
}

check_compose_file() {
    if [ ! -f "$COMPOSE_FILE" ]; then
        print_error "Docker Compose file not found: $COMPOSE_FILE"
        exit 1
    fi
}

start_service() {
    print_status "Starting $SERVICE_NAME service..."
    $DOCKER_COMPOSE up -d
    print_success "Service started successfully"
    echo ""
    show_status
}

stop_service() {
    print_status "Stopping $SERVICE_NAME service..."
    $DOCKER_COMPOSE stop
    print_success "Service stopped successfully"
}

restart_service() {
    print_status "Restarting $SERVICE_NAME service..."
    $DOCKER_COMPOSE restart
    print_success "Service restarted successfully"
    echo ""
    show_status
}

show_status() {
    print_status "Service Status:"
    echo ""
    
    # Check if container is running
    if $DOCKER_COMPOSE ps --quiet | grep -q .; then
        $DOCKER_COMPOSE ps
        echo ""
        
        # Get container ID
        CONTAINER_ID=$($DOCKER_COMPOSE ps --quiet)
        
        if [ ! -z "$CONTAINER_ID" ]; then
            # Show port mapping
            PORTS=$(docker port $CONTAINER_ID 2>/dev/null || echo "No ports mapped")
            print_status "Port Mappings:"
            echo "$PORTS"
            echo ""
            
            # Check health status
            HEALTH=$(docker inspect --format='{{.State.Health.Status}}' $CONTAINER_ID 2>/dev/null || echo "No health check")
            print_status "Health Status: $HEALTH"
            
            # Show resource usage
            echo ""
            print_status "Resource Usage:"
            docker stats --no-stream --format "table {{.Container}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.NetIO}}" $CONTAINER_ID
        fi
    else
        print_warning "No containers running for this service"
    fi
}

show_logs() {
    print_status "Showing live logs (Ctrl+C to exit)..."
    $DOCKER_COMPOSE logs -f
}

show_logs_tail() {
    print_status "Showing last 100 lines of logs..."
    $DOCKER_COMPOSE logs --tail=100
}

build_image() {
    print_status "Building Docker image..."
    $DOCKER_COMPOSE build
    print_success "Image built successfully"
}

rebuild_image() {
    print_status "Rebuilding Docker image (no cache)..."
    $DOCKER_COMPOSE build --no-cache
    print_success "Image rebuilt successfully"
}

pull_images() {
    print_status "Pulling latest base images..."
    $DOCKER_COMPOSE pull
    print_success "Images pulled successfully"
}

show_ps() {
    $DOCKER_COMPOSE ps
}

exec_command() {
    if [ -z "$2" ]; then
        print_error "Please provide a command to execute"
        echo "Usage: $0 exec [command]"
        exit 1
    fi
    
    shift # Remove 'exec' from arguments
    print_status "Executing: $@"
    $DOCKER_COMPOSE exec $SERVICE_NAME "$@"
}

open_shell() {
    print_status "Opening shell in container..."
    $DOCKER_COMPOSE exec $SERVICE_NAME /bin/bash
}

down_service() {
    print_status "Stopping and removing containers..."
    $DOCKER_COMPOSE down
    print_success "Containers removed successfully"
}

clean_all() {
    print_warning "This will remove:"
    echo "  - All containers for this service"
    echo "  - Associated networks"
    echo "  - Associated images"
    echo ""
    read -p "Are you sure? (y/N): " -n 1 -r
    echo ""
    
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        print_status "Cleaning up..."
        $DOCKER_COMPOSE down --rmi all --volumes --remove-orphans
        print_success "Cleanup completed"
    else
        print_status "Cleanup cancelled"
    fi
}

test_service() {
    print_status "Testing service with sample request..."
    
    # Check if service is running
    if ! $DOCKER_COMPOSE ps --quiet | grep -q .; then
        print_error "Service is not running. Start it first with: $0 start"
        exit 1
    fi
    
    # Wait a moment for service to be ready
    sleep 2
    
    # Test health endpoint
    print_status "Testing health endpoint..."
    HEALTH_RESPONSE=$(curl -s http://localhost:${DEFAULT_PORT}/healthz 2>/dev/null)
    
    if echo "$HEALTH_RESPONSE" | grep -q "ok"; then
        print_success "Health check passed"
    else
        print_error "Health check failed"
        exit 1
    fi
    
    # Test render endpoint
    print_status "Testing render endpoint..."
    
    TEMP_FILE="/tmp/test-render-$$.png"
    
    HTTP_CODE=$(curl -s -o "$TEMP_FILE" -w "%{http_code}" \
        -X POST http://localhost:${DEFAULT_PORT}/render \
        -H 'Content-Type: application/json' \
        -d '{
            "templateName": "simple-card",
            "templateData": {
                "badge": "TEST",
                "title": "Docker Test",
                "subtitle": "Testing HTML to Image Service",
                "bg": "#0b1021",
                "color": "#fff"
            },
            "format": "png"
        }' 2>/dev/null)
    
    if [ "$HTTP_CODE" = "200" ]; then
        if [ -f "$TEMP_FILE" ] && [ -s "$TEMP_FILE" ]; then
            FILE_SIZE=$(ls -lh "$TEMP_FILE" | awk '{print $5}')
            print_success "Render test passed (Generated: $FILE_SIZE)"
            print_status "Test image saved to: $TEMP_FILE"
            
            # Try to open the image if on macOS
            if [[ "$OSTYPE" == "darwin"* ]]; then
                open "$TEMP_FILE" 2>/dev/null || true
            fi
        else
            print_error "Render test failed - empty or missing file"
            exit 1
        fi
    else
        print_error "Render test failed with HTTP code: $HTTP_CODE"
        exit 1
    fi
    
    echo ""
    print_success "All tests passed! Service is working correctly."
}

# Main script
check_docker
check_compose_file

case "$1" in
    start)
        start_service
        ;;
    stop)
        stop_service
        ;;
    restart)
        restart_service
        ;;
    status)
        show_status
        ;;
    logs)
        show_logs
        ;;
    logs-tail)
        show_logs_tail
        ;;
    build)
        build_image
        ;;
    rebuild)
        rebuild_image
        ;;
    pull)
        pull_images
        ;;
    ps)
        show_ps
        ;;
    exec)
        exec_command "$@"
        ;;
    shell)
        open_shell
        ;;
    down)
        down_service
        ;;
    clean)
        clean_all
        ;;
    test)
        test_service
        ;;
    help|--help|-h)
        show_help
        ;;
    "")
        show_help
        ;;
    *)
        print_error "Unknown command: $1"
        echo ""
        show_help
        exit 1
        ;;
esac