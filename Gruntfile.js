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
			
		}

	})

	grunt.loadNpmTasks('grunt-contrib-clean')
	grunt.loadNpmTasks('grunt-contrib-copy')
	grunt.loadNpmTasks('grunt-zip')

	grunt.registerTask('package','package application',['clean','copy','zip'])	
	//grunt.registerTask('clean','nettoie les repertoires',['clean'])	
}