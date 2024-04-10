# deploy backend code by pulling changes from remote repo
#!/bin/bash

dev_env="dev"
qa_env="qa"
uat_env="uat"

# Function to print usage
print_usage() {
    echo "Usage: $0 [-e|--environment <dev|qa|uat>]"
}


# Parse options
while [[ "$#" -gt 0 ]]; do
    case $1 in
        -e|--environment) # Option to specify environment
            ENVIRONMENT=$2
            case $ENVIRONMENT in
                develop|qa|uat) # Check if environment is valid #branchange
                    ;;
                *) # Invalid environment
                    echo "Error: Invalid environment. Accepted values: dev, qa, uat."
                    print_usage
                    exit 1
                    ;;
            esac
            shift
            ;;
        *) # Unknown option
            echo "Error: Unknown option: $1"
            print_usage
            exit 1
            ;;
    esac
    shift
done

# Check if environment option is provided
if [ -z "$ENVIRONMENT" ]; then
    echo "Error: Environment option (-e|--environment) is required."
    print_usage
    exit 1
fi

if [ "$ENVIRONMENT" == 'develop' ]; then  #branchange
    env="dev"
else
    env=$ENVIRONMENT
fi


echo "Selected environment: $env"
echo "Deploying to $env environment"
pm2 stop "${env}-server" && pm2 delete "${env}-server"
cd ~/multifamily/$env/backend/multifamily_backend && git pull origin $ENVIRONMENT && npm install
pm2 start ~/multifamily/$env/backend/multifamily_backend/server.js --name "${env}-server" --namespace "${env}-ns"
