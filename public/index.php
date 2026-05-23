<?php

namespace Laravel\Lumen;

use Laravel\Lumen\Application;
use Laravel\Lumen\Http\Request;
use Laravel\Lumen\Routing\Router;

require __DIR__.'/../vendor/autoload.php';

$app = new Application();

$app->router->get('/', function () use ($app) {
    return $app->version();
});

$app->run();