    const dotenv = require("dotenv").config();
    const {GoogleGenerativeAI} = require("@google/generative-ai");
    var crypto = require('crypto');
    var express = require('express');
    var uuid = require('uuid');
    var mysql = require('mysql');
    var bodyParser = require('body-parser');
    const { stringify } = require("querystring");
    const http = require('http');
    const https = require('https');


    //Connect to mysql

    var con = mysql.createConnection({
        host:process.env.DB_HOST,
        user:process.env.DB_USER,
        password:process.env.DB_PASS,
        database:process.env.MYSQL_DB
    });

    //PASSWORD
    var getRandomString = function(length){
        return crypto.randomBytes(Math.ceil(length/2))
        .toString('hex')
        .slice(0,length);
    };

    var sha512 = function(password,salt){
        var hash = crypto.createHmac('sha512',salt);
        hash.update(password);
        var value = hash.digest('hex');
        return {
            salt:salt,
            passwordHash:value
        };

    };

    function saltHashPassword(userPassword){
        var salt = getRandomString(16);
        var passwordData = sha512(userPassword,salt);
        return passwordData;
    };

    function chechHashPassword(userPassword,salt){
        var passwordData = sha512(userPassword,salt);
        return passwordData;
    }

    var app=express();
    app.use(bodyParser.json());
    app.use(bodyParser.urlencoded({extended: true}));

    //GEMINI API 
    const genAI = new GoogleGenerativeAI(process.env.API_KEY);
    async function generate_paraphrase(params) {
        var generated_text = [];
        const prompt = "Paraphrase this text " + params + " ensure that make the prompt without errors. Also make the result paragraph and just send the result nothing else.";
        const model = await genAI.getGenerativeModel({ model: "gemini-pro" });
        const result = await model.generateContentStream([prompt]);
        for await(var chunk of result.stream){
        var chunkText = chunk.text();
        console.log(chunkText);
        generated_text.push(chunkText);
        }
        return generated_text.join('').trimStart();
    }

    async function generate_simplify(params) {
        var generated_text = [];
        const prompt = "Summarize this text [" + params + "] use simple words and ensure that make the prompt without errors. Also make the result paragraph and just send the result and nothing else. If the given text is short return this response [You entered a short text to summarize]";
        const model = await genAI.getGenerativeModel({ model: "gemini-pro" }); 
        const result = await model.generateContentStream([prompt]);
        for await(var chunk of result.stream){
        var chunkText = chunk.text();
        console.log(chunkText);
        generated_text.push(chunkText);
        }
        return generated_text.join('').trimStart();
    }

    async function generate_translate(params,translate) {
        var generated_text = [];
        const prompt = "Translate this text " + params + " to " + translate +" language";
        const model = await genAI.getGenerativeModel({ model: "gemini-pro" }); 
        const result = await model.generateContentStream([prompt]);
        for await(var chunk of result.stream){
        var chunkText = chunk.text();
        console.log(chunkText);
        generated_text.push(chunkText);
        }
        return generated_text.join('').trimStart();
    }



    //GOOGLE IMAGE API & GET IMAGE FUNC
    function getImages(params, callback){
        var url = "https://www.googleapis.com/customsearch/v1?key="+ process.env.IMAGE_SEARCH_API +"&cx="+ process.env.SEARCH_ENGINE +"&searchType=image&q="+ params;
        https.get(url, res =>{
            let body = '';
            res.on('data', data =>{
                body += data;
            })
            res.on('end', () => callback(body));

        })
    }


    //Commands
    app.post('/register/',(req,res,next)=>{
        var post_data = req.body;
        var plaint_password = post_data.password;
        var hash_data = saltHashPassword(plaint_password);
        var password = hash_data.passwordHash;
        var salt = hash_data.salt;
        var username = post_data.username;
        var email = post_data.email;
        var dateofbirth = post_data.dateofbirth;
        
        con.query('select * from user_account where email=?',[email],function(err,result,fields){   
            con.on('error',function(err){
                console.log("[MYSQL ERROR]", err)
            });
            if(result && result.length)
            res.json('User already exist');
        else{
            con.query('insert into user_account (`email`, `username`, `password`, `salt`, `date_of_birth`, `date_joined`) VALUES (?,?,?,?,?,NOW())',[email,username,password,salt,dateofbirth],function(err,result,fields){
                con.on('error',function(err){
                    console.log("[MYSQL ERROR]", err);
                    res.json('Register Error');
                });     
                res.json('Register  Successful');
            });
            }
        });
        
    });


    app.post('/login/',(req,res,next)=>{
        var post_data = req.body;
        var user_password = post_data.password;
        var email = post_data.email;
        con.query('select * from user_account where email=?',[email],function(err,result,fields){
        con.on('error',function(err){
            console.log("[MYSQL ERROR]", err)
        });
        if(result && result.length){
        var salt = result[0].salt;
        var encrypted_password = result[0].password;
        var hashed_password = chechHashPassword(user_password,salt).passwordHash;
        var output = "";
        var titles = "";
        var entries = "";
        output += JSON.stringify(result[0])
        output = output.substring(0, output.length - 1);
        con.query('select num_of_titles from user_collection where user_email=?',[email],function(err,result){
            if(result && result.length){
             titles = result[0].num_of_titles;
             con.query('select num_of_entries from user_collection where user_email=?',[email],function(err,result){
                if(result && result.length){
                    entries = result[0].num_of_entries;
                    if(entries == null)
                        entries = 0;
                    output += `,"num_of_titles":"${titles}","num_of_entries":"${entries}"}`;
                    if(encrypted_password == hashed_password)
                    res.end(output);
                        else
                        res.end(JSON.stringify('[Wrong password]'));
                }

            });
            }
            else{
                output += `,"num_of_titles":"0","num_of_entries":"0"}`;
                    if(encrypted_password == hashed_password)
                    res.end(output);
            }
        });

        }
    else{

                res.json('[User not found]');
            } 


        });
    });


    app.post('/generate/', async(req,res,next)=>{
        var post_data = req.body;
        var input_text = post_data.input_text;
        var selectedOption = post_data.selectedOption;
        var language = post_data.Language;
        var generated = ""; 
        if(selectedOption == "Simplified text:"){
            generated = await generate_simplify(input_text);
        }
        else if(selectedOption == "Paraphrased text:"){
            generated = await generate_paraphrase(input_text);
        }
        else if(selectedOption == "Translated text"){
            generated = await generate_translate(input_text,language);
        }
        res.send(generated);

    });

    app.post('/addcollection/',(req,res,next)=>{
        var post_data = req.body;
        var email = post_data.email;
        var title = post_data.title;
        var author = post_data.author;
        var type = post_data.type;
        var genre = post_data.genre;

    con.query('select * from user_collection where user_email=?',[email],function(err,result,fields){   
            con.on('error',function(err){
                console.log("[MYSQL ERROR]", err);
            });
            if(result && result.length){
            con.query('select collection_id from user_collection where user_email=?',[email],function(err,result,fields){
                con.on('error',function(err){
                    console.log("[MYSQL ERROR]", err);
                });
                if(result && result.length){    
                    var collection_id = result[0].collection_id;
                    con.query('update user_collection set num_of_titles = num_of_titles + 1 where user_email=?',[email], function(err,result){
                        con.query('insert into collection_titles (collection_id, title_name, author, type,genre, last_updated) VALUES (?,?,?,?,?,NOW())',[collection_id,title,author,type,genre]);
                        res.end("Collection Added!");
                    });
                }
            });
            }
            else{
            //Creating new User Collection
            con.query('insert into user_collection (user_email,num_of_titles,num_of_entries,last_updated) VALUES (?,?,NULL,NOW())',[email,1],function(err,result,fields){
                //Creating new collection_titles
            con.query('select collection_id from user_collection where user_email=?',[email],function(err,result,fields){
                con.on('error',function(err){
                    console.log("[MYSQL ERROR]", err);
                });
                if(result && result.length){
                    var collection_id = result[0].collection_id;
                    con.query('insert into collection_titles (collection_id, title_name, author, type, genre, last_updated) VALUES (?,?,?,?,?,NOW())',[collection_id,title,author,type,genre]);
                    res.send("New Collection Added!");
                }
                });
                
            });
        }
        });


    });

    app.post('/deletecollection/',(req,res,next)=>{
        var post_data = req.body;
        var email = post_data.email;
        var title = post_data.title;

    con.query('select * from user_collection where user_email=?',[email],function(err,result,fields){   
            con.on('error',function(err){
                console.log("[MYSQL ERROR]", err);
            });
            if(result && result.length){
            con.query('select collection_id from user_collection where user_email=?',[email],function(err,result,fields){
                con.on('error',function(err){
                    console.log("[MYSQL ERROR]", err);
                });
                if(result && result.length){

                    var collection_id = result[0].collection_id;
                    con.query('update user_collection set num_of_titles = num_of_titles -1 where user_email=?',[email]);
                    
                            con.query('select title_id from collection_titles where collection_id=? and title_name=?',[collection_id,title],function(err,result,fields){
                                    if(result && result.length){
                                        var title_id = result[0].title_id;
                                        con.query('select count(*) as count from entry_texts where text_id in ( select text_id from title_entries where title_id=?)',[title_id],function(err,result){
                                            if(result && result.length){
                                                var count = result[0].count;
                                                con.query('SET FOREIGN_KEY_CHECKS=0');
                                                con.query('SET SQL_SAFE_UPDATES = 0');
                                                con.query('update user_collection set num_of_entries = num_of_entries - ? where user_email=?',[count,email]);
                                                con.query('DELETE FROM entry_texts WHERE text_id IN (SELECT text_id FROM title_entries WHERE title_id = ?);',[title_id]);
                                                con.query('delete from title_entries where title_id=?',[title_id]);
                                                con.query('delete from collection_titles where collection_id = ? and title_name=?',[collection_id,title]);
                                                con.query('SET FOREIGN_KEY_CHECKS=1');
                                                con.query('SET SQL_SAFE_UPDATES = 1');
                                                res.send("Successfully deleted");
                                            }
                                        });
                                    }
                            });
                }
                else{
                    res.send("Cannot get collection ID");
                }
            });
            }
        else{
            res.send("Record not Found"); 
        }
        });


    });


    app.post('/deletetitle/',(req,res,next)=>{
        var post_data = req.body;
        var email = post_data.email;
        var title = post_data.title_name;
        var entry_name = post_data.entry_name;

    con.query('select * from user_collection where user_email=?',[email],function(err,result,fields){   
            con.on('error',function(err){
                console.log("[MYSQL ERROR]", err);
            });
            if(result && result.length){
            con.query('select collection_id from user_collection where user_email=?',[email],function(err,result,fields){
                con.on('error',function(err){
                    console.log("[MYSQL ERROR]", err);
                });
                if(result && result.length){
                    var collection_id = result[0].collection_id;
                    con.query('update user_collection set num_of_entries = num_of_entries -1 where user_email=?',[email]);
                            con.query('select title_id from collection_titles where collection_id=? and title_name=?',[collection_id,title],function(err,result,fields){
                                    if(result && result.length){
                                        var title_id = result[0].title_id;
                                                con.query('SET FOREIGN_KEY_CHECKS=0');
                                                con.query('SET SQL_SAFE_UPDATES = 0');
                                                con.query('DELETE FROM entry_texts WHERE text_id IN (SELECT text_id FROM title_entries WHERE title_id = ? and entry_name = ?);',[title_id,entry_name]);
                                                con.query('delete from title_entries where title_id=? and entry_name =?',[title_id,entry_name]);
                                                con.query('SET FOREIGN_KEY_CHECKS=1');
                                                con.query('SET SQL_SAFE_UPDATES = 1');
                                                res.send("Successfully deleted");
                                                
                                    }
                                    else{
                                        res.send("cant detect title_id")
                                    }

                            });

                }
                else{
                    res.send("Cannot get collection ID");
                }
            });
            }
        else{
            res.send("Record not Found"); 
        }
        });


    });


    app.post('/getcollection/',(req,res)=>{
        var post_data = req.body;
        var email = post_data.email;

        con.query('select collection_id from user_collection where user_email=?',[email],function(err,result,fields) {
            
            con.query('select * from collection_titles where collection_id=?',[result[0].collection_id],function(err,result,fields) {
            
                res.send(JSON.stringify(result));
                console.log(result);
                
            });

        });
    })

    app.post('/getcollection_information/',(req,res)=>{
        var post_data = req.body;
        var title_name = post_data.title_name;

        con.query('select title_id from collection_titles where title_name=?',[title_name],function(err,result,fields) {
            
            if(result && result.length){
                var title_id = result[0].title_id;
                con.query('SELECT t.entry_id, t.title_id, t.entry_name , e.text_id, t.page, e.text_scanned, e.feature_chosen, e.text_generated FROM entry_texts AS e JOIN title_entries AS t ON e.text_id = t.text_id WHERE t.title_id = ?',[title_id],function(err,result,fields) { 
                res.send(JSON.stringify(result))
                });
            }
            else{
                res.send("Could not find title");
            }

        });
    })


    app.post('/imageSearch/', async (req, res) => {
        var post_data = req.body;
        var params = post_data.params;
        var object2 = new Object();
        const linkObject = {};

        getImages(params, (body) =>{
            var obj = JSON.parse(body);
            let jsonstring = `[{"title": "${obj.items[0].title}", "link": "${obj.items[0].link}"}`;
            for (let i = 1; i<obj.items.length;i++){
                if (i === 0) {
                    jsonstring += `{"title": "${obj.items[i].title}", "link": "${obj.items[i].link}"}\n`;
                } else {  
                    jsonstring += `,\n{"title": "${obj.items[i].title}", "link": "${obj.items[i].link}"}`;
                }
            }
            jsonstring += `]`;
            res.send(jsonstring);
    })
    });

    app.post('/addtitle/',(req,res) =>{
        var post_data = req.body;
        var email = post_data.email;
        var title_name = post_data.title_name;
        var page = post_data.page;
        var text_scanned = post_data.text_scanned;
        var text_generated = post_data.text_generated;
        var entry_name = post_data.entry_name;
        var feature_chosen = post_data.feature_chosen;

        con.query('select * from user_collection where user_email=?',[email],function(err,result,fields){
            if(result && result.length){
            con.query('select collection_id from user_collection where user_email=?',[email],function(err,result,fields){
                if(result && result.length){
                    var collection_id = result[0].collection_id;    
                    con.query('select title_id from collection_titles where collection_id=? and title_name=?',[collection_id,title_name],function(err,result,fields){
                        if(result && result.length){
                            var title_id = result[0].title_id;
                        con.query('select num_of_entries from user_collection where user_email =?',[email],function(err,result){
                            if(result && result.length){
                                var entry = result[0].num_of_entries;
                                if(entry == null || entry == "")
                                    con.query('update user_collection set num_of_entries = 1 where user_email=?',[email]);
                                else
                                con.query('update user_collection set num_of_entries = num_of_entries + 1 where user_email=?',[email]);

                                con.query('insert into entry_texts (text_scanned, feature_chosen, text_generated) values(?,?,?)',[text_scanned,feature_chosen,text_generated]);
                        con.query('SELECT LAST_INSERT_ID() AS text_id',function (err,result){
                            if(result && result.length){
                                var text_id = result[0].text_id;
                            con.query('insert into title_entries (title_id, entry_name, page, text_id,image_id) values(?,?,?,?,NULL)',[title_id, entry_name, page,text_id],function(err,result,fields){
                                res.send("Title added successfully!");
                        });
                            }
                        })
                            }
                            else
                            res.send("No value")
                              
                            
                        });
                        
                        }
                        else
                            res.send('title ID not found');
                    })
                }
                else{
                    send.res('Collection ID not found');
                }
            });
            }

        else{
            res.send("Record not Found");
        }
        });
        

    });
        

    app.get('/gettg/',(req,res) =>{
        con.query('select * from genre',function(err,result){
            var output = result;
                con.query('select * from type',function(err,result){
                    const mergedResults = [];
            output.forEach((genre_desc) => {
                mergedResults.push(genre_desc);
            });
            result.forEach((type_desc) => {
                mergedResults.push(type_desc);
            });
                    res.send(JSON.stringify(mergedResults));
                })
        
            
        });
    })

 app.post('/getet/',(req,res)=>{
    var post_data = req.body;
    var email = post_data.email;

    con.query('select num_of_titles from user_collection where user_email=?',[email],function(err,result){
        if(result && result.length){
         titles = result[0].num_of_titles;
         con.query('select num_of_entries from user_collection where user_email=?',[email],function(err,result){
            if(result && result.length){
                entries = result[0].num_of_entries;
                if(entries == null)
                    entries = 0;
                var output = `{"num_of_titles":"${titles}","num_of_entries":"${entries}"}`;
                res.send(output);
            }
        }
    )}

 })
});

    app.listen(3000,() =>{
        console.log("API RNNING");
    });     
