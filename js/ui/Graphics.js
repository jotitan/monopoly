/* Fournit les methodes de dessin d'un plateau de jeu standard (carré) */

var CURRENT_ID_COMPONENT = 0; // Permet de generer un numero de composant unique

/* Fournit des methodes de dessins */
var DrawerHelper = {
	fromDegresToRad:function(angle){
		return (angle/180)*Math.PI;
	},
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
    /* @param align : si null, center, sinon 'left' ou 'right' */
    writeText: function (text, x, y, rotate, canvas, size, specificWidth, align) {
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
            var lng;
            switch(align){
            	case 'left':lng=0;break;
            	case 'right':lng = width - canvas.measureText(mots[i]).width;break;
            	default : lng = (width - canvas.measureText(mots[i]).width) / 2;
            }
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
	infos:{},	// Infos communes

	init:function(){
		return this;
	},
	/* Configure la factory */
	setType:function(type){
		this.type = type;
	},
	addInfo:function(name,info){
		this.infos[name] = info;
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
		return this._instantiate('des',arguments);		
	},
	getCase:function(pos,axe,color,nom,prix,img){
		return this._instantiate('standardCase',arguments);	
	},
	getCaseSpeciale:function(axe,titre){
		return this._instantiate('specialCase',arguments);	
	},
	getPionJoueur:function(color){
		return this._instantiate('pionJoueur',arguments);	
	},
	getPlateau:function(x,y,width,height,color){
		return this._instantiate('plateau',arguments);	
	},
	endPlateau:function(){
		return this._instantiate('endPlateau',arguments);		
	},
	_instantiate:function(method,params){
		if(this.instances[this.type] == null){
			throw "Creation, type : " + this.type + " inconnu";    
		}
		if(this.instances[this.type][method] == null){
			return null;
		}
		var o = {};
		this.instances[this.type][method].apply(o,params);
		return o;
	}
}.init();
