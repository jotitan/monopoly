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
		'ftp-deploy':{
			build:{
				auth:{
					host:'ftpperso.free.fr',
					port:21,
					// Definir les droits dans le fichier .ftppass
					authKey:'default'
				},
				src:'build',
				dest:'monopoly/',
				exclusions:['*.zip']
			}
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
						'js/ui/Graphics.js',
						'js/ui/SquareGraphics.js',
						'js/ui/CircleGraphics.js',
						'js/entity/*.js',
						'js/display/*.js',
						'js/Utils.js',
						'js/Enchere.js',
						'js/GestionConstructions.js',
						'js/GestionTerrains.js',
						'js/Sauvegarde.js',
						'monopoly.js']
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
	grunt.loadNpmTasks('grunt-ftp-deploy')
	grunt.loadNpmTasks('grunt-targethtml')
	grunt.loadNpmTasks('grunt-contrib-uglify')
	grunt.loadNpmTasks('grunt-contrib-watch')

	grunt.registerTask('package','package application',['clean','uglify','copy','targethtml:prod','zip'])
	grunt.registerTask('deploy','deploie application sur serveur ftp',['ftp-deploy'])			
}
