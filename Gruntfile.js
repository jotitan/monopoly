module.exports = function(grunt){

	grunt.initConfig({
		clean: {
  			build: {
    			src: [ 'build' ]
  			}
  		},
  		copy: {
			target:{
				src:['monopoly.js','lib/**','css/**','img/**','data/**','favicon.ico','js/**','monopoly-canvas.html'],
				dest:'build/'
			}
		},
		zip:{
			'build.zip':['build/**']
			
		},
		ftp-deploy:{
			build:{
				auth:{
					host:'ftpperso.free.fr',
					port:21,
					// Definir les droits dans le fichier .ftppass
					authKey:'default'
				},
				src:'build',
				desc:'monopoly/'
			}
		}
	})

	grunt.loadNpmTasks('grunt-contrib-clean')
	grunt.loadNpmTasks('grunt-contrib-copy')
	grunt.loadNpmTasks('grunt-zip')
	grunt.loadNpmTasks('grunt-ftp-deploy')

	grunt.registerTask('package','package application',['clean','copy','zip'])
	grunt.registerTask('deploy','deploie application sur serveur ftp',['ftp-deploy'])	
	grunt.registerTask('clean','nettoie les repertoires',['clean'])	
}