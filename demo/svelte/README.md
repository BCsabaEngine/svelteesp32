# PCB THT holder

[Changelog](CHANGELOG.md)

3D STL file generator for THT PCB panels, online access: https://segmentcontroller.github.io/pcb-tht-holder/

I make almost all of my printed circuit boards with online design software and entrust the manufacturing company to install the SMD components. I install the THT (through hole technology) components at home for two reasons:

- What they charge for meticulous manual work cannot be called cheap.
- Not all THT parts are needed, in many cases only 2 of the 6 relays are installed. This can reduce costs.

> I would also like to do the THT installation at home nicely. However, with many panels there are "traces of haste".

## That's why I created an **online tool** that:

- Based on the photo of the PCB, it helps to leave the place of the protruding (THT) parts empty.
- It creates a 3D format (STL) output that, if you print, will keep the parts straight during soldering.
- It can work without registration and without uploading (and storing) a photo of the PCB.

In its current state, it facilitates the installation of circular and oblong components. This is sufficient in the following cases: **relays, capacitors, resistors, terminals and pin-headers.** It automatically calculates the required area and volume based on the height of the parts. But it doesn't mean that there aren't any mistakes in it: if you experience anything, I welcome your comments.

## Try yout first PCB to STL

Click here: https://segmentcontroller.github.io/pcb-tht-holder/

### Set up a PCB image

Enter a PCB image with drag and drop or file selection, which will automatically flip and become transparent.

![alt text](./step1.png)

### Place the components

Place the THT parts by placing circles or squares. Adjust their height/depth exactly so that they are flush with the PCB. At the end, if necessary, add legs to support the PCB.

![alt text](./step2.png)

### Generate a 3D design in STL format

Click the Display 3D button and see the generated mesh. Rotate it, check that all components are in place. At the end, download the STL file in binary format. (It is also possible to download a text STL file for debug purposes).

![alt text](./step3.png)

### Check as a wireframe if necessary

If you want to analyze the location of the components, you can also see how things fit in the wireframe view.

![alt text](./step4.png)

### Print it with a 3D printer...

Use a PLA printer to save time and money. Practice shows that it is enough to produce the STL file once, of which 1-3 prints are enough to implant hundreds of PCBs.
