"use strict";


var express = require("express");
var app = express();

var fs = require("fs");

var multer = require("multer");
var upload = multer({ dest: "./uploads" });

var mongoose = require("mongoose");

mongoose.connect("mongodb://localhost/Realtec_Image_Bank", { useMongoClient: true })
var conn = mongoose.connection;

var gfs;

var Grid = require("gridfs-stream");
Grid.mongo = mongoose.mongo;

var Schema = mongoose.Schema;

var recImagesSchema = new Schema({
  images: Array,
  reccontador: Number,
  empcodigo: Number
}, { collection: 'recomendacaoImages' });

var RecImages = mongoose.model('recomendacaoImages', recImagesSchema);

conn.once("open", function () {
  gfs = Grid(conn.db);
  app.get("/", function (req, res) {
    //renders a multipart/form-data form
    res.render("home");
  });

  //second parameter is multer middleware.
  app.post("/imageupload/:empcodigo/:reccontador", upload.array("files"), function (req, res, next) {
    var files = req.files;
    var promises = []
    var images_name = []
    RecImages.find(
      {
        reccontador: parseInt(req.params.reccontador),
        empcodigo: parseInt(req.params.empcodigo)
      }, (err, result) => {
        if (result.length == 0) {
          promises.push(new Promise((resolve, reject) => {
            files.forEach((file, key) => {
              var filename = 'E' + req.params.empcodigo + 'R' + req.params.reccontador + 'K' + key + 'F' + file.originalname;
              images_name.push(filename);
              var writestream = gfs.createWriteStream({
                filename: filename,
                root: 'images'
              });
              fs.createReadStream("./uploads/" + file.filename)
                .on("end", function () { fs.unlink("./uploads/" + file.filename, function (err) { resolve("success") }) })
                .on("err", function () { reject("Erro no upload") })
                .pipe(writestream);
            })
          }));

          Promise.all(promises).then(() => {
            var item = {
              images: images_name,
              reccontador: req.params.reccontador,
              empcodigo: req.params.empcodigo
            };
            var data = new RecImages(item);
            data.save();
            res.send({ error: false, message: req.files.length + " imagens salvas com sucesso!\n Empresa: " + req.params.empcodigo + " | Recomendacao: " + req.params.reccontador + "", data: data })

          }).catch((err) => {
            res.status(500).send(err);
          })
        }

        if (result.length > 0) {
          res.status(500).send({ error: true, message: "Recomendação já cadastrada" });
        }

      });
  });

  app.get("/imageupload/:empcodigo/:reccontador", function (req, res, next) {
    RecImages.findOne(
      {
        reccontador: parseInt(req.params.reccontador),
        empcodigo: parseInt(req.params.empcodigo)
      }, (err, result) => {
        if (result != null)
          res.send({ error: false, message: "Imagens encontradas com sucesso!\n Empresa: " + req.params.empcodigo + " | Recomendacao: " + req.params.reccontador + "", data: result })
        else {
          res.status(500).send({ error: true, message: "Recomendação não encontrada" });
        }
      })
  });
  app.delete("/imageupload/:empcodigo/:reccontador", function (req, res, next) {

    RecImages.findOne(
      {
        reccontador: parseInt(req.params.reccontador),
        empcodigo: parseInt(req.params.empcodigo)
      }, (err, result) => {
        if (err || result == null) {
          res.status(500).send({ error: true, message: "Recomendação não encontrada" });
          return;
        }
        result.images.forEach(img => {

          gfs.remove({ filename: img, root: 'images' }, function (err) {
            if (err) return console.log("Erro ao excluir imagem");
            console.log("Imagem deleteda!");
          });


        })
        RecImages.remove(
          {
            reccontador: parseInt(req.params.reccontador),
            empcodigo: parseInt(req.params.empcodigo)
          }, (error, result) => {
            res.send({ error: false, message: "Registros deletados com sucesso" })
          })
      })



  });

  app.get("/bankimages/:tam/:filename", function (req, res) {
    try {
      const sharp = require('sharp');
      const fs = require('fs');
      let inStream = gfs.createReadStream({
        filename: req.params.filename,
        root: 'images'
      });

      inStream.on("error", (e)=>{
        res.status(500).send("Não encontrado");
      })

      if (parseInt(req.params.tam) == 0) {
        inStream.pipe(res);
      } else if (req.params.tam.indexOf("x") != -1) {
        var width = parseInt(req.params.tam.split("x")[0])
        var height = parseInt(req.params.tam.split("x")[1])
        if (height >= 3000 || width >= 3000) {
          res.status(500).send("Erro: O tamanho deve ser menor que 3000px");
        }
        let transform = sharp().greyscale(false).resize({ width, height });
        inStream.pipe(transform).pipe(res);
      } else {
        if (parseInt(req.params.tam) >= 3000) {
          res.status(500).send("Erro: O tamanho deve ser menor que 3000px");
        }
        let transform = sharp().greyscale(false).resize({ height: parseInt(req.params.tam) });
        inStream.pipe(transform).pipe(res);
      }
    } catch (error) {
      res.status(500).send(error);
    }
  });

  app.get("/bankimages/delete/:filename", function (req, res) {
    gfs.exist({ filename: req.params.filename, root: 'images' }, function (err, found) {
      if (err) return res.send("Error occured");
      if (found) {
        gfs.remove({ filename: req.params.filename, root: 'images' }, function (err) {
          if (err) return res.send("Error occured");
          res.send("Image deleted!");
        });
      } else {
        res.send("No image found with that title");
      }
    });
  });
});

if (!module.parent) {
  app.listen(3000, function () {
    console.log("Aplicação rodando na porta 3000!")
  });
}
