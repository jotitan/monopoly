module.exports = function(grunt){

	grunt.initConfig({
		clean: {
  			build: {
    			src: [ 'build' ]
  			}
  		},
  		copy: {
			target:{expand:true,
				src:['lib/**','css/**','img/**','data/**','favicon.ico'],
				dest:'build/'
			}
		},
		zip:{
			'build/monopoly.zip':['build/**']

		},
		targethtml:{
			dev:{
				files:{
					'monopoly.html':'monopoly-template.html'
				}
			},
			prod:{
				files:{
					'build/index.html':'monopoly-template.html'
				}
			}
		},
		uglify:{
			build:{
				options:{
					mangle:true,
					compress:true,
					report:'min'
				},
				files:{
					'build/monopoly-min.js':[
						'js/ui/*.js',
						'js/entity/*.js',
						'js/display/*.js',
						'js/utils.js',
						'js/enchere.js',
						'js/gestion_constructions.js',
						'js/gestion_terrains.js',
						'js/gestion_joueur.js',
						'js/sauvegarde.js',
						'js/utils.js',
						'js/monopoly.js']
				}
			}
		},
		watch:{
			scripts:{
				files:'monopoly-template.html',
				tasks:['targethtml:dev']
			}
		}
	})

	grunt.loadNpmTasks('grunt-contrib-clean')
	grunt.loadNpmTasks('grunt-contrib-copy')
	grunt.loadNpmTasks('grunt-zip')
	grunt.loadNpmTasks('grunt-targethtml')
	grunt.loadNpmTasks('grunt-contrib-uglify')
	grunt.loadNpmTasks('grunt-contrib-watch')

	grunt.registerTask('package','package application',['clean','uglify','copy','targethtml:prod','zip'])
	grunt.registerTask('deploy','deploie application sur serveur ftp',['ftp-deploy'])
}
