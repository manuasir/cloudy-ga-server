#!/usr/bin/env node

var rest = require('restler'),
nodeo = require('nodeo'),
trap = nodeo.trap,
fs = require('fs');

var conf_file = process.argv[2] || 'nodeo.json';

var conf = JSON.parse(fs.readFileSync( conf_file, 'utf8' ));

// console.log(conf);
var log = [];

if ( !conf ) {
    throw "Problems with conf file";
}

log.push( conf );
var traps = conf.fitness.traps;
var chromosome_size = conf.fitness.l*traps;
var total_generations = 0;

var trapf = new trap.Trap( conf.fitness );

var eo = new nodeo.Nodeo( { population_size: conf.population_size,
			    chromosome_size: chromosome_size,
			    fitness_func: trapf } );
var url = "http://"+conf.host;
if ( conf.port ) {
    url += ":"+conf.port;
}
url += "/";

var experiment_id;
log.push( { start: process.hrtime() } );
var UUID= process.env.LOGNAME+"-"+process.pid;
rest.put( url + 'start/' + UUID + "/with/" + conf.population_size)
    .on('complete', function( data ) {
	if ( data.experiment_id != undefined ) {
	    experiment_id = data.experiment_id;
	}
    });
console.log( "Starting ");
// start running the GA
var generation_count = 0;
var finished = false;

// Start loop
generation();

// ---------------------------------

function generation() {
    generation_count++;
    eo.generation();
    if ( (eo.fitness_of[eo.population[0]] < traps*conf.fitness.b ) && (generation_count*conf.population_size < conf.max_evaluations )) {
	console.log( eo.population[0] );
	setImmediate(generation);

	if (generation_count % 100 === 0 ) {
	    // get from pool
	    rest.get( url + 'random' ).on('complete', function( data ) {
		if ( data.chromosome ) {
		    eo.incorporate( data.chromosome );
		}
	    });
	    
	    // put in pool
	    rest.put( url + 'experiment/' +experiment_id
		      + '/one/' + eo.population[0] + "/" 
		      + eo.fitness_of[eo.population[0]]
		      + "/" + UUID ).on("complete", function( result, response ) {
			  if ( response.statusCode == 410 ) {
			      finished = true;
			      experiment_id = result.current_id;
			  }
		      });
	}
    } else {
	// to force the end of the experiment
	if ( eo.fitness_of[eo.population[0]] >= traps*conf.fitness.b ) {
	    rest.put( url + 'experiment/' +experiment_id
		      + '/one/' + eo.population[0] + "/" 
		      + eo.fitness_of[eo.population[0]]
		      + "/" + UUID );
	}
	log.push( {
	    end: { 
		time: process.hrtime(),
		generation: total_generations,
		best : { chromosome : eo.population[0],
			 fitness : eo.fitness_of[eo.population[0]]
		       }
	    }
	} );
	conf.output = conf.output_preffix+".json";
	fs.writeFileSync(conf.output, JSON.stringify(log));
	console.log("Finished");
    }
}
