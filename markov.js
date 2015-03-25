var lib = require('./lib');
    Chance = require('chance'),
    MongoClient = lib.MongoClient,
    async = lib.async,
    await = lib.await,
    Log = lib.Log,
    sprintf = lib.sprintf;

function LetterTokenizer() {
  this.tokenize = function(text) {
    return text;
  };
}

function LetterSymbolizer() {
  this.symbolize = function(text) {
    return text.toLowerCase();
  };
}

function WordTokenizer() {
  this.tokenize = function(text) {
    return scan(text, /[^\s]+/g);
  };

  function scan(text, re) {
    if (!re.global) {
      throw 'RegEx must be global.';
    }

    var m, r = [];
    while (m = re.exec(text)) {
      r.push(m[0]);
    }

    return r;
  };
}

function WordSymbolizer() {
  this.symbolize = function(text) {
    var symbol = text.trim().toLowerCase().replace(/[^\w]/, '');
    return symbol || text.trim().toLowerCase();
  };
}

function MarkovChainGenerator(markovCollection, degree) {
  this.chance = new Chance();

  this.generate = async(function() {
    var prevStates = [];
    for (var i = 0; i < degree; ++i) {
      prevStates.push(null);
    }

    var text = '';
    while (true) {
      var next = await(this.nextSymbol(prevStates));
      if (next.symbol == null) {
        break;
      }

      text += next.token + ' ';

      prevStates.shift();
      prevStates.push(next.symbol);
    }

    return text.trim();
  });

  this.nextSymbol = async(function(states) {
    var cursor = await(markovCollection.findAsync({ state: states }));

    var options = [];
    var weights = [];
    while ((doc = await(cursor.nextObjectAsync())) != null) {
      options.push({ symbol: doc.next, token: doc.tokens[0] });
      weights.push(doc.count);
    }

    return this.chance.weighted(options, weights);
  });
}

function MarkovChainBuilder(markovCollection, tokenizer, symbolizer, degree) {
  markovCollection.ensureIndex({ state: 1 }, function() { });
  markovCollection.ensureIndex({ state: 1, next: 1 }, function() { });

  this.addDocuments = async(function(collection, selector) {
    var cursor = await(collection.findAsync());
    var count = await(cursor.countAsync());

    var index = 0;
    while ((doc = await(cursor.nextObjectAsync())) != null) {
      index++;

      var text = selector(doc);
      if (text === null) {
        continue;
      }

      await(this.addText(text));

      if (index % 1000 == 0) {
        var percent = Math.ceil((index / count) * 100);
        Log.info(sprintf('%d/%d (%d%%)', index, count, percent));
      }
    }
  });

  this.addText = async(function(text) {
    var prevStates = [];
    for (var i = 0; i < degree; ++i) {
      prevStates.push(null);
    }

    var tokens = tokenizer.tokenize(text);
    for (var i = 0; i < tokens.length; ++i) {
      var token = tokens[i];
      var symbol = symbolizer.symbolize(token);

      await(this.link(prevStates, symbol, token));

      prevStates.shift();
      prevStates.push(symbol);
    }

    await(this.link(prevStates, null, null));
  });

  this.link = async(function(states, symbol, token) {
    await(markovCollection.findAndModifyAsync(
      { state: states, next: symbol },
      null,
      { $addToSet: { tokens: token }, $inc: { count: 1 } },
      { new: true, upsert: true }
    ));
  });
}

var run = async(function() {
  var db = await(MongoClient.connectAsync('mongodb://localhost:27017/source'));
  var messages = db.collection('source');

  var markovDb = await(MongoClient.connectAsync('mongodb://localhost:27017/dest'));
  var collection = markovDb.collection('dest');

  var builder = new MarkovChainBuilder(collection, new WordTokenizer(), new WordSymbolizer(), 3);
  await(builder.addDocuments(messages, function(d) { return d.text });

  var generator = new MarkovChainGenerator(collection, 2);
  console.log(await(generator.generate()));

  db.close();
  markovDb.close();
});

run().done();
