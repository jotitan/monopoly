/* Fournit les methodes de dessin d'un plateau de jeu standard (carré) */

var CURRENT_ID_COMPONENT = 0; // Permet de generer un numero de composant unique

/* Fournit des methodes de dessins */
var DrawerHelper = {
	drawCircle:function(canvas,color,rayon,center){
		canvas.fillStyle=color;
		canvas.beginPath();
		canvas.arc(center.x,center.y,rayon,0,2*Math.PI);
		canvas.fill();
		canvas.closePath();
	},
	drawArcCircle:function(canvas,color,rayon,center,alphaStart,alphaEnd){
		canvas.beginPath();
		canvas.fillStyle = color;
		canvas.moveTo(center.x,center.y);
		canvas.arc(center.x,center.y,rayon,alphaStart,alphaEnd);
		canvas.fill();
		canvas.closePath();	
	},
    drawImage: function (canvas, img, x, y, width, height, rotate) {
		canvas.save();
		canvas.translate(x, y);
		canvas.rotate(rotate);
		try{
			canvas.drawImage(img, 0, 0, width, height);
		}catch(e){}
		canvas.restore();
    },
    writeText: function (text, x, y, rotate, canvas, size, specificWidth, notCenter) {
        var width = specificWidth || largeur;
		canvas.strokeStyle='#000000';
        canvas.font = ((size != null) ? size : "7") + "pt Times news roman";
        // Mesure la longueur du mot
        var mots = [text];
        if (canvas.measureText(text).width > width - 5) {
            // On split les mots intelligement (on regroupe)
            var splitMots = text.split(" ");
            var pos = 0;
            for (var i = 0; i < splitMots.length; i++) {
                if (pos > 0 && (canvas.measureText(mots[pos - 1]).width + canvas.measureText(splitMots[i]).width) < width - 5) {
                    // on concatene
                    mots[pos - 1] = mots[pos - 1] + " " + splitMots[i];
                } else {
                    mots[pos++] = splitMots[i];
                }
            }
        }
        canvas.save();
        canvas.translate(x, y);
        canvas.rotate(rotate);
        var pas = 12;
        for (var i = 0; i < mots.length; i++) {
            var lng = (notCenter)?0:(width - canvas.measureText(mots[i]).width) / 2;
            canvas.strokeText(mots[i], lng, i * pas);
        }
        canvas.font = "6pt Times news roman";
        canvas.restore();
    }
}

/* Tout objet graphique etant de component */
function Component() {
	// Genere un id unique
	this.id = CURRENT_ID_COMPONENT++;
	this.draw = function (canvas) {
		console.log("Not implemented");
	}
}


/* En fonction du type de plateau (square, circle), fournit les objets permettant de le construire */
/* Renvoie uniquement des components (implemente draw) */
var DrawerFactory = {
	instances:[],
	type:null,

	init:function(){
		return this;
	},
	/* Configure la factory */
	setType:function(type){
		this.type = type;
	},
	/* Ajoute une nouvelle implementation */
	/* A implementer : type, standardCase, specialCase */
	addInstance:function(instance){
		this.instances[instance.type] = instance;
	},
	getPlateau:function(){
		return;
	},
	getDes:function(x, y, width){
		if(this.instances[this.type] == null){
			throw "Creation des, type : " + this.type + " inconnu";    
		}
		return new this.instances[this.type].des(x, y, width);   
	},
	getCase:function(pos,axe,color,nom,prix,img){
		if(this.instances[this.type] == null){
			throw "Creation case, type : " + this.type + " inconnu";    
		}
		return new this.instances[this.type].standardCase(pos, axe, color, nom, prix, img);            
	},
	getCaseSpeciale:function(axe,titre){
		if(this.instances[this.type] == null){
			throw "Creation case speciale, type : " + this.type + " inconnu";    
		}
		return new this.instances[this.type].specialCase(axe,titre);                        
	},
	getPionJoueur:function(color){
		if(this.instances[this.type] == null){
			throw "Creation pion, type : " + this.type + " inconnu";    
		}
		return new this.instances[this.type].pionJoueur(color,largeurPion);
	},
	getPlateau:function(x,y,width,height,color){
		if(this.instances[this.type] == null){
			throw "Creation plateau, type : " + this.type + " inconnu";    
		}
		return new this.instances[this.type].plateau(x,y,width,height,color);
	},
	endPlateau:function(canvas){
		if(this.instances[this.type] == null){
			throw "Creation plateau, type : " + this.type + " inconnu";    
		}
		return new this.instances[this.type].endPlateau(canvas);
	}
}.init();
