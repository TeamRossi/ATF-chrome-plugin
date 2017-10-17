function distinct(l, getter){
	h = {}
	for (var i =0; i<l.length; i++){
		key = getter(l[i])
		if (key in h){
			h[key]+=1
		} else {
			h[key]=1
		}
	}

	console.log("List entries: " + l.length + ", distinct: " + Object.keys(h).length);

	for (var key in  h){
		if (h[key]>1){
			console.log("Key: <" + key + ">, count: " + h[key]);
		}
	}
}