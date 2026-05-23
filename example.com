# هذا الملف يحتوي على إعدادات البيئة للطبيق، ويتم استخدامه لتحديد قيم متغيرات البيئة مثل اسم التطبيق، قيم الاتصال بالبيانات، إعدادات الأمان، وغيرها.

APP_NAME=Laravel
APP_ENV=local
APP_KEY=base64:zC6P63YSbMCZJOKsGWAdK15JXHazH2UE2TeurpxTelY=
APP_DEBUG=true
APP_URL=http://localhost

APP_LOCALE=en
APP_FALLBACK_LOCALE=en
APP_FAKER_LOCALE=en_US

APP_MAINTENANCE_DRIVER=file
# APP_MAINTENANCE_STORE=database

# PHP_CLI_SERVER_WORKERS=4

BCRYPT_ROUNDS=12

LOG_CHANNEL=stack
LOG_STACK=single
LOG_DEPRECATIONS_CHANNEL=null
LOG_LEVEL=debug

DB_CONNECTION=sqlite
# DB_HOST=127.0.0.1
# DB_PORT=3306
# DB_DATABASE=u630748251_kozertravel
# DB_USERNAME=u630748251_kozertravel
# DB_PASSWORD=

SESSION_DRIVER=database
SESSION_LIFETIME=120
SESSION_ENCRYPT=false
SESSION_PATH=/
SESSION_DOMAIN=null

BROADCAST_CONNECTION=log
FILESYSTEM_DISK=local
QUEUE_CONNECTION=database

CACHE_STORE=database
# CACHE_PREFIX=

MEMCACHED_HOST=127.0.0.1

REDIS_CLIENT=phpredis
REDIS_HOST=127.0.0.1
REDIS_PASSWORD=null
REDIS_PORT=6379

MAIL_MAILER=log
MAIL_SCHEME=null
MAIL_HOST=127.0.0.1
MAIL_PORT=2525
MAIL_USERNAME=null
MAIL_PASSWORD=null
MAIL_FROM_ADDRESS="hello@example.com"
MAIL_FROM_NAME="${APP_NAME}"

AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
AWS_DEFAULT_REGION=us-east-1
AWS_BUCKET=
AWS_USE_PATH_STYLE_ENDPOINT=false

VITE_APP_NAME="${APP_NAME}"

# Travelpayouts affiliate
TRAVELPAYOUTS_MARKER=633503
TRAVELPAYOUTS_TOKEN=696ce9a5144bdc8212f5836c5e09c2dd

# Admin security — comma-separated IPs allowed to access /admin (empty = no restriction)
ADMIN_ALLOWED_IPS=

# Admin notifications — email address that receives contact messages and new subscriber alerts
ADMIN_EMAIL=
