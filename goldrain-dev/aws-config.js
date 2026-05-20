// AWS Configuration
// IMPORTANT: Replace these values with your actual AWS configuration

const AWS_CONFIG = {
    // AWS Region
    region: 'us-east-1', // Replace with your preferred region

    // Cognito User Pool Configuration
    userPoolId: 'us-east-1_7SLl7qkYW', // Replace with your User Pool ID
    userPoolWebClientId: '1cicrektl5t4pacjdq2e2dq96s', // Replace with your App Client ID
    
    // Cognito Identity Pool Configuration
    identityPoolId: 'us-east-1:53f7a0f0-54ef-42f3-8f02-b9b7199924a6', // Replace with your Identity Pool ID
    
    // S3 Configuration
    s3BucketName: 'gold-rain-investment-portfolio-bucket', // Replace with your S3 bucket name
    s3Region: 'us-east-1', // Replace with your S3 bucket region
    
    // CloudFront Configuration (optional)
    cloudFrontDomainName: 'd2qvi8k4vgbf9r.cloudfront.net', // Replace if using CloudFront
    
    // API Configuration (if using API Gateway)
    apiGatewayUrl: 'https://your-api-id.execute-api.region.amazonaws.com/stage' // Replace if using API Gateway
};

// Export configuration
if (typeof module !== 'undefined' && module.exports) {
    module.exports = AWS_CONFIG;
} else if (typeof window !== 'undefined') {
    window.AWS_CONFIG = AWS_CONFIG;
}

// AWS Service Initialization
class AWSServices {
    constructor() {
        this.isInitialized = false;
        this.cognitoIdentityCredentials = null;
        this.s3 = null;
        this.userPool = null;
        this.currentUser = null;
    }

    // Initialize AWS services
    async initialize() {
        if (this.isInitialized) return;

        try {
            // Configure AWS SDK
            AWS.config.update({
                region: AWS_CONFIG.region
            });

            // Initialize Cognito User Pool
            this.userPool = new AmazonCognitoIdentity.CognitoUserPool({
                UserPoolId: AWS_CONFIG.userPoolId,
                ClientId: AWS_CONFIG.userPoolWebClientId
            });

            // Initialize Cognito Identity Credentials
            this.cognitoIdentityCredentials = new AWS.CognitoIdentityCredentials({
                IdentityPoolId: AWS_CONFIG.identityPoolId
            });

            AWS.config.credentials = this.cognitoIdentityCredentials;

            // Initialize S3
            this.s3 = new AWS.S3({
                region: AWS_CONFIG.s3Region,
                params: {
                    Bucket: AWS_CONFIG.s3BucketName
                }
            });

            this.isInitialized = true;
            console.log('AWS services initialized successfully');
        } catch (error) {
            console.error('Failed to initialize AWS services:', error);
            throw error;
        }
    }

    // Update credentials after authentication
    async updateCredentials(idToken) {
        const loginKey = `cognito-idp.${AWS_CONFIG.region}.amazonaws.com/${AWS_CONFIG.userPoolId}`;
        
        this.cognitoIdentityCredentials.params.Logins = {
            [loginKey]: idToken
        };

        return new Promise((resolve, reject) => {
            this.cognitoIdentityCredentials.refresh((error) => {
                if (error) {
                    console.error('Failed to refresh credentials:', error);
                    reject(error);
                } else {
                    console.log('Credentials refreshed successfully');
                    resolve();
                }
            });
        });
    }

    // Get current authenticated user
    getCurrentUser() {
        if (!this.userPool) {
            throw new Error('AWS services not initialized');
        }
        return this.userPool.getCurrentUser();
    }

    // Get user session
    async getUserSession() {
        const cognitoUser = this.getCurrentUser();
        if (!cognitoUser) {
            throw new Error('No authenticated user found');
        }

        return new Promise((resolve, reject) => {
            cognitoUser.getSession((err, session) => {
                if (err) {
                    reject(err);
                    return;
                }
                if (!session.isValid()) {
                    reject(new Error('Invalid session'));
                    return;
                }
                resolve(session);
            });
        });
    }

    // Get user attributes
    async getUserAttributes() {
        const cognitoUser = this.getCurrentUser();
        if (!cognitoUser) {
            throw new Error('No authenticated user found');
        }

        // First ensure we have a valid session
        const session = await this.getUserSession();
        
        return new Promise((resolve, reject) => {
            cognitoUser.getUserAttributes((err, attributes) => {
                if (err) {
                    console.error('getUserAttributes error:', err);
                    // Try to refresh the session and retry
                    cognitoUser.getSession((sessionErr, refreshedSession) => {
                        if (sessionErr) {
                            reject(new Error('User session expired. Please sign in again.'));
                            return;
                        }
                        // Retry getting attributes
                        cognitoUser.getUserAttributes((retryErr, retryAttributes) => {
                            if (retryErr) {
                                reject(new Error('Failed to get user attributes after session refresh'));
                                return;
                            }
                            const attributesObj = {};
                            retryAttributes.forEach(attr => {
                                attributesObj[attr.getName()] = attr.getValue();
                            });
                            resolve(attributesObj);
                        });
                    });
                    return;
                }
                
                const attributesObj = {};
                attributes.forEach(attr => {
                    attributesObj[attr.getName()] = attr.getValue();
                });
                resolve(attributesObj);
            });
        });
    }

    // Sign out user
    signOut() {
        const cognitoUser = this.getCurrentUser();
        if (cognitoUser) {
            cognitoUser.signOut();
        }
        
        // Clear credentials
        if (this.cognitoIdentityCredentials) {
            this.cognitoIdentityCredentials.clearCachedId();
        }
        
        // Redirect to login
        window.location.href = 'login.html';
    }

    // Check if user is authenticated
    async isAuthenticated() {
        try {
            const session = await this.getUserSession();
            return session && session.isValid();
        } catch (error) {
            return false;
        }
    }

    // S3 Operations
    async getObject(key) {
        if (!this.s3) {
            throw new Error('S3 not initialized');
        }

        const params = {
            Bucket: AWS_CONFIG.s3BucketName,
            Key: key
        };

        return new Promise((resolve, reject) => {
            this.s3.getObject(params, (err, data) => {
                if (err) {
                    console.error('S3 getObject error:', err);
                    if (err.statusCode === 404 || err.code === 'NoSuchKey') {
                        resolve(null); // Object doesn't exist
                    } else {
                        reject(err);
                    }
                    return;
                }
                
                console.log('S3 response for key:', key, 'Size:', data.Body.length);
                
                try {
                    let bodyText;
                    if (typeof data.Body === 'string') {
                        bodyText = data.Body;
                    } else if (data.Body.toString) {
                        bodyText = data.Body.toString();
                    } else {
                        bodyText = new TextDecoder().decode(data.Body);
                    }
                    
                    const parsedData = JSON.parse(bodyText);
                    console.log('Successfully parsed JSON for key:', key);
                    resolve(parsedData);
                } catch (parseError) {
                    console.error('JSON parse error for key:', key, parseError);
                    reject(parseError);
                }
            });
        });
    }

    async putObject(key, data) {
        if (!this.s3) {
            throw new Error('S3 not initialized');
        }

        const params = {
            Bucket: AWS_CONFIG.s3BucketName,
            Key: key,
            Body: JSON.stringify(data, null, 2),
            ContentType: 'application/json'
        };

        return new Promise((resolve, reject) => {
            console.log('Saving to S3 key:', key);
            this.s3.putObject(params, (err, result) => {
                if (err) {
                    console.error('S3 putObject error:', err);
                    reject(err);
                } else {
                    console.log('Successfully saved to S3 key:', key);
                    resolve(result);
                }
            });
        });
    }

    async deleteObject(key) {
        if (!this.s3) {
            throw new Error('S3 not initialized');
        }

        const params = {
            Bucket: AWS_CONFIG.s3BucketName,
            Key: key
        };

        try {
            // Try promise() first, fallback to direct promise for different SDK versions
            try {
                return await this.s3.deleteObject(params).promise();
            } catch (promiseError) {
                return await this.s3.deleteObject(params);
            }
        } catch (error) {
            console.error('S3 deleteObject error:', error);
            throw error;
        }
    }

    // Generate S3 key for user portfolio
    getUserPortfolioKey(userId) {
        return `portfolios/${userId}/portfolio.json`;
    }

    // Generate S3 key for user transactions
    getUserTransactionsKey(userId) {
        return `portfolios/${userId}/transactions.json`;
    }
}

// Create global instance
const awsServices = new AWSServices();

// Export for use in other files
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { AWS_CONFIG, AWSServices, awsServices };
} else if (typeof window !== 'undefined') {
    window.AWSServices = AWSServices;
    window.awsServices = awsServices;
}